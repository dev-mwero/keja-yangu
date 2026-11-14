import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRoleManagementActor } from "@/app/api/v1/admin/users/_guard";
import { writeAuditEvent } from "@/lib/audit";
import { connectToDatabase } from "@/lib/mongoose";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { ManagementAssignment } from "@/models/ManagementAssignment";
import { User } from "@/models/User";

const statusChangeInput = z.object({
  isActive: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

interface UserDoc {
  _id: unknown;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  isActive?: boolean;
  privileges?: string[];
  tokenVersion?: number;
  createdAt?: Date;
}

function serialize(user: UserDoc) {
  return {
    id: String(user._id),
    name: user.name ?? "",
    email: user.email ?? "",
    phone: user.phone ?? "",
    role: user.role ?? "",
    isActive: user.isActive !== false,
    createdAt: user.createdAt ?? null,
  };
}

/**
 * Activates or deactivates a user account. System-admin only and flagged.
 *
 * Security invariants:
 * - `system-admin` accounts are CLI-managed and cannot be touched here, so the
 *   last-active-admin floor stays a CLI concern.
 * - Actors cannot change their own status (no self-lockout, no self-rescue).
 * - Audit-first: the event is written before the mutation, so a failed audit
 *   aborts the change (fail closed).
 * - Deactivation bumps `tokenVersion` (live sessions die immediately) and
 *   revokes delegated portfolio assignments. Reactivation does NOT restore
 *   them — access must be re-granted deliberately.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 30 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const actor = await requireRoleManagementActor(request);
  if (actor instanceof NextResponse) return actor;

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = statusChangeInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid status payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (id === actor.userId) {
    return NextResponse.json(
      { error: "You cannot change your own account status" },
      { status: 403 },
    );
  }

  await connectToDatabase();
  const target = (await User.findById(id)
    .select("name email phone role isActive privileges tokenVersion createdAt")
    .lean()) as UserDoc | null;
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (target.role === "system-admin") {
    return NextResponse.json(
      { error: "System-admin accounts are managed via the CLI, not the dashboard" },
      { status: 403 },
    );
  }

  const nextIsActive = parsed.data.isActive;
  const currentIsActive = target.isActive !== false;
  if (currentIsActive === nextIsActive) {
    return NextResponse.json({ data: serialize(target) });
  }

  const reason = parsed.data.reason ?? "";
  const deactivating = !nextIsActive;

  try {
    // Audit-first: if this fails, the mutation below never runs.
    await writeAuditEvent({
      actor: { userId: actor.userId, role: actor.role },
      action: "user.status_changed",
      entityType: "user",
      entityId: id,
      before: { isActive: currentIsActive },
      after: { isActive: nextIsActive, reason },
      request: {
        ip: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      },
    });
  } catch (error) {
    console.error("Account status audit failed", error);
    return NextResponse.json(
      { error: "Audit unavailable; status change aborted" },
      { status: 500 },
    );
  }

  const updateData: Record<string, unknown> = { isActive: nextIsActive };
  if (deactivating) {
    // Kill live sessions; a suspended account must not keep acting.
    updateData.tokenVersion = (target.tokenVersion ?? 0) + 1;
  }

  await User.updateOne({ _id: id }, { $set: updateData });

  if (deactivating) {
    // Delegated authority dies with the account and is deliberately not
    // restored on reactivation — that requires an explicit re-grant.
    await ManagementAssignment.updateMany(
      { principalUserId: id, status: { $in: ["active", "pending", "suspended"] } },
      {
        $set: {
          status: "revoked",
          revokedByUserId: actor.userId,
          revokedAt: new Date(),
          reason: reason || "Account deactivated",
        },
      },
    );
  }

  return NextResponse.json({
    data: serialize({ ...target, isActive: nextIsActive }),
  });
}
