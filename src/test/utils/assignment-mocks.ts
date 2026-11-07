import type { AccessRole, AssignmentLike } from "@/lib/authorization-policy";

/**
 * Builds an active `ManagementAssignment` row for scoped-authorization tests.
 * Mirrors the shape `ManagementAssignment.find(...).lean()` yields so policy
 * evaluation accepts it without any further stubbing.
 */
export function activeAssignment(input: {
  principalUserId: string;
  accessRole: AccessRole;
  propertyId: string;
  permissions: string[];
  scopeType?: AssignmentLike["scopeType"];
  blockId?: string;
  unitId?: string;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
}): AssignmentLike {
  const scopeType = input.scopeType ?? "property";
  return {
    principalUserId: input.principalUserId,
    accessRole: input.accessRole,
    scopeType,
    propertyId: input.propertyId,
    ...(scopeType === "block" ? { blockId: input.blockId ?? input.propertyId } : {}),
    ...(scopeType === "unit" ? { unitId: input.unitId ?? input.propertyId } : {}),
    permissions: input.permissions,
    status: "active",
    startsAt: input.startsAt ?? new Date("2026-01-01T00:00:00.000Z"),
    endsAt: input.endsAt ?? null,
  };
}
