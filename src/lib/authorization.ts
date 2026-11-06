import { connectToDatabase } from "@/lib/mongoose";
import type { Action, Role } from "@/lib/permissions";
import { ManagementAssignment } from "@/models/ManagementAssignment";
import { User } from "@/models/User";

export type PolicyAction =
  | Action
  | "property:read"
  | "property:claim"
  | "assignment:read"
  | "assignment:grant"
  | "assignment:revoke"
  | "ownership:read"
  | "ownership:manage"
  | "audit:read"
  | "broker:authorize"
  | "broker:revoke"
  | "broker:agreement:manage";

export type AccessRole = "admin" | "custodian" | "caretaker";

export interface PolicyActor {
  userId: string;
  role: Role;
  isActive: boolean;
}

export interface PolicyResource {
  propertyId?: string;
  blockId?: string;
  unitId?: string;
  lifecycleState?: "draft" | "active" | "archived" | "merged";
}

export interface AssignmentLike {
  principalUserId: string;
  accessRole: AccessRole;
  scopeType: "property" | "block" | "unit";
  propertyId: string;
  blockId?: string;
  unitId?: string;
  permissions: string[];
  status: string;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
}

export interface AuthorizationResult {
  allowed: boolean;
  reason: string;
}

const PLATFORM_ACTIONS = new Set<PolicyAction>([
  "property-type:manage",
  "recycle-bin:manage",
  "ownership:manage",
]);

const ADMIN_ACTIONS: PolicyAction[] = [
  "property:read",
  "property:create",
  "property:claim",
  "property:edit",
  "property:delete",
  "unit:read",
  "unit:manage",
  "custodian:manage",
  "tenant:manage",
  "move-request:create",
  "move-request:manage",
  "application:manage",
  "lease:manage",
  "invoice:read",
  "invoice:manage",
  "invoice:mark-paid",
  "invoice:generate",
  "lead:manage",
  "lead:read",
  "notification:read-own",
  "notification:manage",
  "settings:read",
  "settings:write",
  "complaint:read-own",
  "complaint:create",
  "complaint:manage",
  "chat:read-own",
  "chat:send",
  "chat:manage",
  "announcement:read",
  "announcement:manage",
  "document:read-own",
  "document:manage",
  "assignment:read",
  "assignment:grant",
  "assignment:revoke",
  "ownership:read",
  "audit:read",
  "broker:authorize",
  "broker:revoke",
  "broker:agreement:manage",
];

const CUSTODIAN_ACTIONS: PolicyAction[] = [
  "property:read",
  "property:edit",
  "unit:read",
  "unit:manage",
  "tenant:manage",
  "move-request:create",
  "move-request:manage",
  "application:manage",
  "lease:manage",
  "invoice:read",
  "invoice:manage",
  "invoice:mark-paid",
  "invoice:generate",
  "lead:manage",
  "lead:read",
  "notification:read-own",
  "notification:manage",
  "settings:read",
  "settings:write",
  "complaint:read-own",
  "complaint:create",
  "complaint:manage",
  "chat:read-own",
  "chat:send",
  "chat:manage",
  "announcement:read",
  "announcement:manage",
  "document:read-own",
  "document:manage",
  "assignment:read",
  "ownership:read",
];

const CARETAKER_ACTIONS: PolicyAction[] = [
  "property:read",
  "property:create",
  "property:edit",
  "property:delete",
  "unit:read",
  "unit:manage",
  "tenant:manage",
  "move-request:create",
  "move-request:manage",
  "application:manage",
  "invoice:read",
  "invoice:manage",
  "invoice:mark-paid",
  "invoice:generate",
  "lead:read",
  "lead:manage",
  "notification:read-own",
  "notification:manage",
  "settings:read",
  "settings:write",
  "complaint:read-own",
  "complaint:create",
  "complaint:manage",
  "chat:read-own",
  "chat:send",
  "chat:manage",
  "announcement:read",
  "announcement:manage",
  "document:read-own",
  "document:manage",
  "assignment:read",
];

const TENANT_ACTIONS = new Set<PolicyAction>([
  "invoice:read-own",
  "notification:read-own",
  "notification:manage",
  "settings:read",
  "settings:write",
  "complaint:read-own",
  "complaint:create",
  "chat:read-own",
  "chat:send",
  "announcement:read",
  "document:read-own",
  "move-request:create",
]);

export const POLICY_ACTIONS: PolicyAction[] = [
  ...new Set([
    ...PLATFORM_ACTIONS,
    ...ADMIN_ACTIONS,
    ...CUSTODIAN_ACTIONS,
    ...CARETAKER_ACTIONS,
    ...TENANT_ACTIONS,
  ]),
];

const ROLE_MAXIMUM: Record<AccessRole, Set<PolicyAction>> = {
  admin: new Set(ADMIN_ACTIONS),
  custodian: new Set(CUSTODIAN_ACTIONS),
  caretaker: new Set(CARETAKER_ACTIONS),
};

const RESOURCE_FREE_ACTIONS = new Set<PolicyAction>([
  "property:create",
  "property:claim",
  "assignment:read",
]);

export function isResourceFreePolicyAction(action: PolicyAction): boolean {
  return RESOURCE_FREE_ACTIONS.has(action);
}

function normalizeAccessRole(role: Role): AccessRole | null {
  if (role === "owner") return "admin";
  if (role === "admin" || role === "custodian" || role === "caretaker") return role;
  return null;
}

function isActiveAssignment(assignment: AssignmentLike, now: Date): boolean {
  if (assignment.status !== "active") return false;
  if (assignment.startsAt && new Date(assignment.startsAt).getTime() > now.getTime()) return false;
  if (assignment.endsAt && new Date(assignment.endsAt).getTime() <= now.getTime()) return false;
  return true;
}

export function assignmentCoversResource(
  assignment: AssignmentLike,
  resource: PolicyResource,
): boolean {
  if (!resource.propertyId || assignment.propertyId !== resource.propertyId) return false;
  if (assignment.scopeType === "property") return true;
  if (!resource.blockId || assignment.blockId !== resource.blockId) return false;
  if (assignment.scopeType === "block") return true;
  return Boolean(resource.unitId) && assignment.unitId === resource.unitId;
}

export function evaluatePolicy(input: {
  actor: PolicyActor;
  action: PolicyAction;
  resource?: PolicyResource;
  assignments: AssignmentLike[];
  now?: Date;
}): AuthorizationResult {
  const { actor, action, resource, assignments } = input;
  const now = input.now ?? new Date();

  if (!actor.isActive) return { allowed: false, reason: "inactive-actor" };

  if (actor.role === "system-admin") {
    return { allowed: true, reason: "system-admin" };
  }

  if (actor.role === "tenant") {
    return TENANT_ACTIONS.has(action)
      ? { allowed: true, reason: "tenant-self-service" }
      : { allowed: false, reason: "tenant-action-not-allowed" };
  }

  const accessRole = normalizeAccessRole(actor.role);
  if (!accessRole) return { allowed: false, reason: "unsupported-role" };

  const maximum = ROLE_MAXIMUM[accessRole];
  if (PLATFORM_ACTIONS.has(action) || !maximum.has(action)) {
    return { allowed: false, reason: "role-maximum" };
  }

  if (!resource) {
    return RESOURCE_FREE_ACTIONS.has(action)
      ? { allowed: true, reason: "resource-free-action" }
      : { allowed: false, reason: "resource-required" };
  }

  if (resource.lifecycleState === "archived" || resource.lifecycleState === "merged") {
    return { allowed: false, reason: "resource-not-writable" };
  }

  const activeAssignments = assignments.filter(
    (assignment) =>
      assignment.principalUserId === actor.userId && isActiveAssignment(assignment, now),
  );

  for (const assignment of activeAssignments) {
    if (assignment.accessRole !== accessRole) continue;
    if (!assignment.permissions.includes(action)) continue;
    if (!assignmentCoversResource(assignment, resource)) continue;
    return { allowed: true, reason: "assignment" };
  }

  return { allowed: false, reason: "no-matching-assignment" };
}

export interface ActorContext {
  actor: PolicyActor;
  assignments: AssignmentLike[];
}

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

export function evaluateActorPolicy(
  context: ActorContext,
  action: PolicyAction,
  resource?: PolicyResource,
  now?: Date,
): AuthorizationResult {
  return evaluatePolicy({
    actor: context.actor,
    action,
    resource,
    assignments: context.assignments,
    now,
  });
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

export function roleMaximumActions(role: AccessRole): PolicyAction[] {
  return [...ROLE_MAXIMUM[role]];
}

export interface CapabilityAssignment {
  assignmentId: string;
  accessRole: AccessRole;
  scopeType: AssignmentLike["scopeType"];
  propertyId: string;
  blockId: string;
  unitId: string;
  actions: PolicyAction[];
  startsAt: string | null;
  endsAt: string | null;
}

export interface Capabilities {
  role: Role;
  global: boolean;
  assignments: CapabilityAssignment[];
  actions: PolicyAction[];
}

function effectiveActions(permissions: unknown, maximum: Set<PolicyAction>): PolicyAction[] {
  if (!Array.isArray(permissions)) return [];
  return [
    ...new Set(
      permissions.filter(
        (permission): permission is PolicyAction =>
          typeof permission === "string" && maximum.has(permission as PolicyAction),
      ),
    ),
  ];
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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
