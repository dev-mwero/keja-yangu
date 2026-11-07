import type { Action, Role } from "@/lib/permissions";
import { connectToDatabase } from "@/lib/mongoose";
import {
  type ActorContext,
  type AssignmentLike,
  type CapabilityAssignment,
  type Capabilities,
  type PolicyAction,
  type PolicyActor,
  type PolicyResource,
  ADMIN_ACTIONS,
  CARETAKER_ACTIONS,
  CUSTODIAN_ACTIONS,
  effectiveActions,
  isActiveAssignment,
  type AuthorizationResult,
  evaluateActorPolicy,
  normalizeAccessRole,
  PLATFORM_ACTIONS,
  ROLE_MAXIMUM,
  TENANT_ACTIONS,
  toIso,
} from "@/lib/authorization-policy";
import { ManagementAssignment } from "@/models/ManagementAssignment";
import { User } from "@/models/User";

export * from "@/lib/authorization-policy";
export type { Action, Role };

export async function loadActorContext(userId: string): Promise<ActorContext | null> {
  await connectToDatabase();
  const user = await User.findById(userId).select("_id role isActive").lean();
  if (!user?.isActive) return null;

  const actor: PolicyActor = {
    userId: String(user._id),
    role: user.role,
    isActive: user.isActive,
  };
  if (actor.role === "system-admin") return { actor, assignments: [] };

  const assignments = await ManagementAssignment.find({
    principalUserId: userId,
    status: "active",
  }).lean();

  return {
    actor,
    assignments: assignments as unknown as AssignmentLike[],
  };
}

export async function authorize(
  userId: string,
  action: PolicyAction,
  resource?: PolicyResource,
): Promise<AuthorizationResult> {
  const context = await loadActorContext(userId);
  if (!context) return { allowed: false, reason: "inactive-actor" };
  return evaluateActorPolicy(context, action, resource);
}

export async function getCapabilities(userId: string): Promise<Capabilities | null> {
  await connectToDatabase();
  const user = await User.findById(userId).select("_id role isActive").lean();
  if (!user?.isActive) return null;

  if (user.role === "tenant") {
    return {
      role: user.role,
      global: false,
      assignments: [],
      actions: [...TENANT_ACTIONS],
    };
  }

  if (user.role === "system-admin") {
    return {
      role: user.role,
      global: true,
      assignments: [],
      actions: [
        ...new Set([
          ...PLATFORM_ACTIONS,
          ...ADMIN_ACTIONS,
          ...CUSTODIAN_ACTIONS,
          ...CARETAKER_ACTIONS,
        ]),
      ],
    };
  }

  const accessRole = normalizeAccessRole(user.role);
  if (!accessRole) {
    return { role: user.role, global: false, assignments: [], actions: [] };
  }

  const maximum = ROLE_MAXIMUM[accessRole];
  const now = new Date();
  const assignments = await ManagementAssignment.find({
    principalUserId: userId,
    status: "active",
  }).lean();

  const active = (assignments as unknown as (AssignmentLike & { _id: unknown })[]).filter(
    (assignment) => assignment.accessRole === accessRole && isActiveAssignment(assignment, now),
  );

  const capabilities: CapabilityAssignment[] = active.map((assignment) => ({
    assignmentId: String(assignment._id),
    accessRole: assignment.accessRole,
    scopeType: assignment.scopeType,
    propertyId: assignment.propertyId,
    blockId: assignment.blockId ?? "",
    unitId: assignment.unitId ?? "",
    actions: effectiveActions(assignment.permissions, maximum),
    startsAt: toIso(assignment.startsAt),
    endsAt: toIso(assignment.endsAt),
  }));

  return {
    role: user.role,
    global: false,
    assignments: capabilities,
    actions: [...new Set(capabilities.flatMap((assignment) => assignment.actions))],
  };
}
