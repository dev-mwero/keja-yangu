import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { getManagedOwnerId } from "@/lib/managed-owner";
import { connectToDatabase } from "@/lib/mongoose";
import {
  authenticate,
  CARETAKER_PRIVILEGES,
  type CaretakerPrivilege,
  getAdminAssignmentScope,
  isPrivilegedCustodian,
} from "@/lib/permissions";
import { syncCaretakerPrivilegeAssignments } from "@/lib/property-staff";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { Property } from "@/models/Property";
import { User } from "@/models/User";

const privilegeInput = z.object({
  privileges: z.array(z.enum(CARETAKER_PRIVILEGES)),
});

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 20 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid caretaker id" }, { status: 400 });
  }

  const auth = authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const actor = await User.findById(auth.userId).select("-passwordHash").lean();
  if (!actor?.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const privilegedCustodian = isPrivilegedCustodian(actor);
  if (
    actor.role !== "owner" &&
    actor.role !== "system-admin" &&
    actor.role !== "admin" &&
    !privilegedCustodian
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = privilegeInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid privileges payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const target = await User.findById(id).select("role privileges").lean();
  if (target?.role !== "caretaker") {
    return NextResponse.json({ error: "Target user is not a caretaker" }, { status: 400 });
  }

  const privileges: CaretakerPrivilege[] = [...new Set(parsed.data.privileges)];
  const update: { privileges: CaretakerPrivilege[] } = { privileges };

  if (actor.role === "admin") {
    const scope = await getAdminAssignmentScope(String(actor._id), "property:read" as never);
    const assignedProperties = scope.assignedPropertyIds.length
      ? await Property.find({ _id: { $in: scope.assignedPropertyIds } })
          .select("ownerId")
          .lean()
      : [];
    const allowedOwners = new Set(assignedProperties.map((property) => String(property.ownerId)));
    const targetManaged = await getManagedOwnerId(id);
    if (!allowedOwners.has(targetManaged)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (actor.role === "owner") {
    const ownerId = String(actor._id);
    const boundOwnerId = await getManagedOwnerId(id);
    if (boundOwnerId !== "" && boundOwnerId !== ownerId) {
      return NextResponse.json({ error: "Caretaker is bound to another owner" }, { status: 409 });
    }
  } else if (actor.role === "custodian") {
    const ownerId = await getManagedOwnerId(String(actor._id));
    const targetManaged = await getManagedOwnerId(id);
    if (!ownerId || targetManaged !== ownerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const updated = await User.findOneAndUpdate({ _id: id }, update, {
    new: true,
    runValidators: true,
  })
    .select("name email phone privileges")
    .lean();
  if (!updated) {
    return NextResponse.json({ error: "Caretaker not found" }, { status: 404 });
  }

  await syncCaretakerPrivilegeAssignments(
    id,
    (updated.privileges ?? privileges) as string[],
    String(actor._id),
  );

  await writeAuditEvent({
    actor: { userId: String(actor._id), role: actor.role },
    action: "caretaker.privileges.updated",
    entityType: "user",
    entityId: id,
    before: { privileges: target.privileges ?? [] },
    after: { privileges: updated.privileges ?? privileges },
    request: {
      ip: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    },
  });

  return NextResponse.json({
    data: {
      id: String(updated._id),
      name: updated.name,
      email: updated.email,
      phone: updated.phone ?? "",
      managedByOwnerId: await getManagedOwnerId(String(updated._id)),
      privileges: updated.privileges ?? [],
    },
  });
}
