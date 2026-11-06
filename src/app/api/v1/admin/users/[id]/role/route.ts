import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRoleManagementActor } from "@/app/api/v1/admin/users/_guard";
import { writeAuditEvent } from "@/lib/audit";
import { connectToDatabase } from "@/lib/mongoose";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { ASSIGNABLE_ROLES, requiresManagedOwner } from "@/lib/role-management";
import { BrokerProfile } from "@/models/BrokerProfile";
import { ManagementAssignment } from "@/models/ManagementAssignment";
import { Property } from "@/models/Property";
import { User } from "@/models/User";

const roleChangeInput = z.object({
  role: z.enum(ASSIGNABLE_ROLES),
  managedByOwnerId: z.string().trim().min(1).optional(),
  reason: z.string().trim().max(500).optional(),
});

interface UserDoc {
  _id: unknown;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  isActive?: boolean;
  managedByOwnerId?: string;
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
    managedByOwnerId: user.managedByOwnerId ?? "",
    privileges: user.privileges ?? [],
    createdAt: user.createdAt ?? null,
  };
}

/**
 * Changes a user's role. System-admin only and feature-flagged.
 *
 * Security invariants (see security ruling):
 * - `system-admin` can never be granted or revoked here; the target role enum
 *   excludes it and targets that currently hold it are rejected.
 * - Actors cannot change their own role.
 * - The role change and its audit event are one unit: the audit is written
 *   before the mutation, so a failed audit aborts the change (fail closed).
 * - Delegated authority is revoked on every transition, the session token is
 *   invalidated via `tokenVersion`, and property staff arrays are cleaned up.
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
  const parsed = roleChangeInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid role payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const nextRole = parsed.data.role;
  if (id === actor.userId) {
    return NextResponse.json({ error: "You cannot change your own role" }, { status: 403 });
  }

  await connectToDatabase();
  const target = (await User.findById(id)
    .select("name email phone role isActive managedByOwnerId privileges tokenVersion createdAt")
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

  let nextOwnerId = "";
  if (requiresManagedOwner(nextRole)) {
    nextOwnerId = parsed.data.managedByOwnerId ?? target.managedByOwnerId ?? "";
    if (!nextOwnerId) {
      return NextResponse.json(
        { error: "managedByOwnerId is required for caretaker or custodian roles" },
        { status: 400 },
      );
    }
    const owner = await User.findOne({ _id: nextOwnerId, role: "owner", isActive: true })
      .select("_id")
      .lean();
    if (!owner) {
      return NextResponse.json(
        { error: "managedByOwnerId must reference an active owner" },
        { status: 400 },
      );
    }
  }

  const currentOwnerId = target.managedByOwnerId ?? "";
  const alreadySameRole = target.role === nextRole && currentOwnerId === nextOwnerId;
  if (alreadySameRole) {
    return NextResponse.json({ data: serialize(target) });
  }

  const reason = parsed.data.reason ?? "";
  const nextTokenVersion = (target.tokenVersion ?? 0) + 1;

  try {
    // Audit-first: if this fails, the mutation below never runs.
    await writeAuditEvent({
      actor: { userId: actor.userId, role: actor.role },
      action: "user.role_changed",
      entityType: "user",
      entityId: id,
      before: {
        role: target.role,
        managedByOwnerId: currentOwnerId,
        privileges: target.privileges ?? [],
      },
      after: {
        role: nextRole,
        managedByOwnerId: nextOwnerId,
        privileges: [],
        reason,
      },
      request: {
        ip: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      },
    });
  } catch (error) {
    console.error("Role change audit failed", error);
    return NextResponse.json({ error: "Audit unavailable; role change aborted" }, { status: 500 });
  }

  await User.updateOne(
    { _id: id },
    {
      $set: {
        role: nextRole,
        managedByOwnerId: nextOwnerId,
        privileges: [],
        tokenVersion: nextTokenVersion,
      },
    },
  );

  // Delegated authority is portfolio-scoped; a role change invalidates it.
  await ManagementAssignment.updateMany(
    { principalUserId: id, status: { $in: ["active", "pending", "suspended"] } },
    {
      $set: {
        status: "revoked",
        revokedByUserId: actor.userId,
        revokedAt: new Date(),
        reason: reason || `Role changed to ${nextRole}`,
      },
    },
  );

  // Remove stale staff links from property documents.
  await Property.updateMany(
    { $or: [{ caretakerIds: id }, { custodianIds: id }] },
    { $pull: { caretakerIds: id, custodianIds: id } },
  );

  if (target.role === "broker" && nextRole !== "broker") {
    await BrokerProfile.updateOne(
      { userId: id },
      {
        $set: {
          status: "suspended",
          suspendedByUserId: actor.userId,
          suspendedAt: new Date(),
          suspensionReason: reason || `Role changed to ${nextRole}`,
        },
      },
    );
  }

  const updated = (await User.findById(id)
    .select("name email phone role isActive managedByOwnerId privileges tokenVersion createdAt")
    .lean()) as UserDoc | null;

  return NextResponse.json({ data: serialize(updated ?? target) });
}
