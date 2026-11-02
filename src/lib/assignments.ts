import { writeAuditEvent } from "@/lib/audit";
import {
  type ActorContext,
  evaluateActorPolicy,
  loadActorContext,
  type PolicyAction,
  type PolicyResource,
  roleMaximumActions,
} from "@/lib/authorization";
import type { AssignmentAccessRole, AssignmentScopeType } from "@/lib/domain-enums";
import {
  loadBlockResource,
  loadPropertyResource,
  loadUnitResource,
  type ResourceLoadResult,
} from "@/lib/policy-resources";
import { ManagementAssignment } from "@/models/ManagementAssignment";
import { User } from "@/models/User";

export type AssignmentErrorCode =
  | "unauthorized"
  | "forbidden"
  | "invalid"
  | "not-found"
  | "conflict";

export class AssignmentError extends Error {
  constructor(
    public readonly code: AssignmentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AssignmentError";
  }
}

export interface GrantAssignmentInput {
  principalUserId: string;
  accessRole: AssignmentAccessRole;
  scopeType: AssignmentScopeType;
  propertyId: string;
  blockId?: string;
  unitId?: string;
  permissions: PolicyAction[];
  startsAt?: Date;
  endsAt?: Date | null;
  reason?: string;
}

export interface AssignmentView {
  _id: string;
  principalUserId: string;
  accessRole: AssignmentAccessRole;
  scopeType: AssignmentScopeType;
  propertyId: string;
  blockId: string;
  unitId: string;
  permissions: string[];
  status: string;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  reason?: string;
  grantedByUserId?: string;
  grantedAt?: Date | string | null;
  acceptedAt?: Date | string | null;
  revokedByUserId?: string;
  revokedAt?: Date | string | null;
}

function invalid(message: string): never {
  throw new AssignmentError("invalid", message);
}

function resourceOrThrow(result: ResourceLoadResult): PolicyResource {
  if (result.ok) return result.resource;
  if (result.reason === "not-found") {
    throw new AssignmentError("not-found", "Resource not found");
  }
  throw new AssignmentError("invalid", "Resource parent chain is inconsistent");
}

async function resolveTargetScope(input: GrantAssignmentInput): Promise<PolicyResource> {
  if (input.scopeType === "property") {
    if (input.blockId || input.unitId)
      invalid("Block and unit ids are not allowed at property scope");
    return resourceOrThrow(await loadPropertyResource(input.propertyId));
  }

  if (input.scopeType === "block") {
    if (!input.blockId) invalid("blockId is required for block scope");
    if (input.unitId) invalid("unitId is not allowed at block scope");
    const resource = resourceOrThrow(await loadBlockResource(input.blockId));
    if (resource.propertyId !== input.propertyId) invalid("Block is outside the property");
    return resource;
  }

  if (!input.blockId) invalid("blockId is required for unit scope");
  if (!input.unitId) invalid("unitId is required for unit scope");
  const resource = resourceOrThrow(await loadUnitResource(input.unitId));
  if (resource.propertyId !== input.propertyId) invalid("Unit is outside the property");
  if (resource.blockId !== input.blockId) invalid("Unit is outside the block");
  return resource;
}

function assignmentResource(assignment: AssignmentView): PolicyResource {
  return {
    propertyId: assignment.propertyId,
    blockId: assignment.blockId || undefined,
    unitId: assignment.unitId || undefined,
  };
}

function assignmentScope(assignment: PolicyResource) {
  return {
    propertyId: assignment.propertyId ?? "",
    blockId: assignment.blockId ?? "",
    unitId: assignment.unitId ?? "",
  };
}

function assignmentSnapshot(assignment: AssignmentView) {
  return {
    principalUserId: assignment.principalUserId,
    accessRole: assignment.accessRole,
    scopeType: assignment.scopeType,
    propertyId: assignment.propertyId,
    blockId: assignment.blockId,
    unitId: assignment.unitId,
    permissions: assignment.permissions,
    status: assignment.status,
    startsAt: assignment.startsAt ?? null,
    endsAt: assignment.endsAt ?? null,
    reason: assignment.reason ?? "",
  };
}

function auditActor(context: ActorContext) {
  return { userId: context.actor.userId, role: context.actor.role };
}

async function actorContextOrThrow(userId: string): Promise<ActorContext> {
  const context = await loadActorContext(userId);
  if (!context) throw new AssignmentError("unauthorized", "User not found or inactive");
  return context;
}

async function ensureNoDuplicate(input: GrantAssignmentInput): Promise<void> {
  const duplicate = await ManagementAssignment.findOne({
    principalUserId: input.principalUserId,
    accessRole: input.accessRole,
    scopeType: input.scopeType,
    propertyId: input.propertyId,
    blockId: input.blockId ?? "",
    unitId: input.unitId ?? "",
    status: { $in: ["pending", "active"] },
  }).lean();
  if (duplicate) {
    throw new AssignmentError(
      "conflict",
      "An active or pending assignment already covers that scope",
    );
  }
}

async function ensureTargetUser(input: GrantAssignmentInput): Promise<void> {
  const principal = await User.findById(input.principalUserId).select("_id role isActive").lean();
  if (!principal) throw new AssignmentError("not-found", "Target user not found");
  if (!principal.isActive) invalid("Target user is inactive");

  const role = principal.role === "owner" ? "admin" : principal.role;
  if (role !== input.accessRole) {
    invalid("Target user role does not match the assignment access role");
  }
}

export async function grantAssignment(
  actorUserId: string,
  input: GrantAssignmentInput,
): Promise<{ assignmentId: string }> {
  const context = await actorContextOrThrow(actorUserId);
  const resource = await resolveTargetScope(input);

  const grant = evaluateActorPolicy(context, "assignment:grant", resource);
  if (!grant.allowed) {
    throw new AssignmentError("forbidden", "Not allowed to grant assignments on this scope");
  }

  const targetMaximum = new Set(roleMaximumActions(input.accessRole));
  const permissions = [...new Set(input.permissions)];
  if (permissions.length === 0) invalid("At least one permission is required");
  for (const permission of permissions) {
    if (!targetMaximum.has(permission)) {
      invalid(`${permission} is not allowed for the ${input.accessRole} role`);
    }
    if (context.actor.role !== "system-admin") {
      const check = evaluateActorPolicy(context, permission, resource);
      if (!check.allowed) {
        throw new AssignmentError(
          "forbidden",
          `Cannot grant ${permission} outside your own authority`,
        );
      }
    }
  }

  await ensureTargetUser(input);
  await ensureNoDuplicate(input);

  const startsAt = input.startsAt ?? new Date();
  const endsAt = input.endsAt ?? null;
  if (endsAt && endsAt.getTime() <= startsAt.getTime()) {
    invalid("endsAt must be after startsAt");
  }

  const created = await ManagementAssignment.create({
    principalUserId: input.principalUserId,
    accessRole: input.accessRole,
    scopeType: input.scopeType,
    propertyId: input.propertyId,
    blockId: input.blockId ?? "",
    unitId: input.unitId ?? "",
    permissions,
    status: "pending",
    startsAt,
    endsAt,
    grantedByUserId: actorUserId,
    grantedAt: new Date(),
    reason: input.reason ?? "",
    source: "invitation",
  });

  const view: AssignmentView = {
    _id: String(created._id),
    ...input,
    blockId: input.blockId ?? "",
    unitId: input.unitId ?? "",
    permissions,
    status: "pending",
    startsAt,
    endsAt,
    grantedByUserId: actorUserId,
    grantedAt: created.grantedAt,
  };

  try {
    await writeAuditEvent({
      actor: auditActor(context),
      action: "assignment.grant",
      entityType: "ManagementAssignment",
      entityId: view._id,
      scope: assignmentScope(resource),
      after: assignmentSnapshot(view),
    });
  } catch (error) {
    await ManagementAssignment.deleteOne({ _id: created._id });
    throw error;
  }

  return { assignmentId: view._id };
}

export async function acceptAssignment(
  principalUserId: string,
  assignmentId: string,
): Promise<{ assignmentId: string }> {
  const context = await actorContextOrThrow(principalUserId);
  const assignment = (await ManagementAssignment.findOne({
    _id: assignmentId,
    principalUserId,
  }).lean()) as AssignmentView | null;
  if (!assignment) throw new AssignmentError("not-found", "Assignment not found");
  if (assignment.status !== "pending") {
    throw new AssignmentError("conflict", "Only pending assignments can be accepted");
  }

  const now = new Date();
  const endsAt = assignment.endsAt ? new Date(assignment.endsAt) : null;
  if (endsAt && endsAt.getTime() <= now.getTime()) {
    throw new AssignmentError("conflict", "Assignment has expired");
  }

  const accepted = await ManagementAssignment.findOneAndUpdate(
    { _id: assignmentId, principalUserId, status: "pending" },
    { $set: { status: "active", acceptedAt: now } },
    { new: true },
  ).lean();
  if (!accepted) {
    throw new AssignmentError("conflict", "Only pending assignments can be accepted");
  }

  const after: AssignmentView = { ...assignment, status: "active", acceptedAt: now };
  try {
    await writeAuditEvent({
      actor: auditActor(context),
      action: "assignment.accept",
      entityType: "ManagementAssignment",
      entityId: assignmentId,
      scope: assignmentScope(assignmentResource(assignment)),
      before: assignmentSnapshot(assignment),
      after: assignmentSnapshot(after),
    });
  } catch (error) {
    await ManagementAssignment.updateOne(
      { _id: assignmentId },
      { $set: { status: "pending", acceptedAt: null } },
    );
    throw error;
  }

  return { assignmentId };
}

export async function revokeAssignment(
  actorUserId: string,
  assignmentId: string,
  reason: string,
): Promise<{ assignmentId: string }> {
  const context = await actorContextOrThrow(actorUserId);
  const assignment = (await ManagementAssignment.findById(
    assignmentId,
  ).lean()) as AssignmentView | null;
  if (!assignment) throw new AssignmentError("not-found", "Assignment not found");
  if (assignment.status !== "active" && assignment.status !== "pending") {
    throw new AssignmentError("conflict", "Assignment is not active or pending");
  }
  if (!reason.trim()) invalid("A revocation reason is required");

  const check = evaluateActorPolicy(context, "assignment:revoke", assignmentResource(assignment));
  if (!check.allowed) {
    throw new AssignmentError("forbidden", "Not allowed to revoke this assignment");
  }

  const now = new Date();
  const after: AssignmentView = {
    ...assignment,
    status: "revoked",
    revokedByUserId: actorUserId,
    revokedAt: now,
    reason,
  };

  await ManagementAssignment.updateOne(
    { _id: assignmentId },
    {
      $set: {
        status: "revoked",
        revokedByUserId: actorUserId,
        revokedAt: now,
        reason,
      },
    },
  );

  try {
    await writeAuditEvent({
      actor: auditActor(context),
      action: "assignment.revoke",
      entityType: "ManagementAssignment",
      entityId: assignmentId,
      scope: assignmentScope(assignmentResource(assignment)),
      before: assignmentSnapshot(assignment),
      after: assignmentSnapshot(after),
    });
  } catch (error) {
    await ManagementAssignment.updateOne(
      { _id: assignmentId },
      {
        $set: {
          status: assignment.status,
          revokedByUserId: assignment.revokedByUserId ?? "",
          revokedAt: assignment.revokedAt ?? null,
          reason: assignment.reason ?? "",
        },
      },
    );
    throw error;
  }

  return { assignmentId };
}
