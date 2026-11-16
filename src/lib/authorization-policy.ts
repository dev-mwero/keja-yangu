/**
 * Pure authorization policy (no mongoose/model imports): action catalogs,
 * role maximums, resource scoping, and evaluation. Split out of
 * `authorization.ts` so scripts running under tsx's ESM loader can import
 * the pure policy — importing the app models fails there because Node's CJS
 * lexer cannot detect mongoose's `models` export.
 */
import type { Action, Role } from "@/lib/permissions";

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

export const PLATFORM_ACTIONS = new Set<PolicyAction>([
  "property-type:manage",
  "recycle-bin:manage",
  "ownership:manage",
]);

export const ADMIN_ACTIONS: PolicyAction[] = [
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
  "task:read-own",
  "task:create",
  "task:manage",
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

export const CUSTODIAN_ACTIONS: PolicyAction[] = [
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
  "task:read-own",
  "task:create",
  "task:manage",
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

export const CARETAKER_ACTIONS: PolicyAction[] = [
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
  "task:read-own",
  "task:create",
  "task:manage",
  "chat:read-own",
  "chat:send",
  "chat:manage",
  "announcement:read",
  "announcement:manage",
  "document:read-own",
  "document:manage",
  "assignment:read",
];

export const TENANT_ACTIONS = new Set<PolicyAction>([
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
  "unit:read",
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

export const ROLE_MAXIMUM: Record<AccessRole, Set<PolicyAction>> = {
  admin: new Set(ADMIN_ACTIONS),
  custodian: new Set(CUSTODIAN_ACTIONS),
  caretaker: new Set(CARETAKER_ACTIONS),
};

export const RESOURCE_FREE_ACTIONS = new Set<PolicyAction>([
  "property:create",
  "property:claim",
  "assignment:read",
]);

export function isResourceFreePolicyAction(action: PolicyAction): boolean {
  return RESOURCE_FREE_ACTIONS.has(action);
}

export function normalizeAccessRole(role: Role): AccessRole | null {
  if (role === "admin" || role === "custodian" || role === "caretaker") return role;
  return null;
}

export function isActiveAssignment(assignment: AssignmentLike, now: Date): boolean {
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

export function effectiveActions(permissions: unknown, maximum: Set<PolicyAction>): PolicyAction[] {
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

export function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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

/**
 * Portfolio-level decision for routes that act on a collection rather than a
 * single resource (list endpoints, creates without a chosen property). A staff
 * actor passes when at least one active assignment grants the action; the
 * route is responsible for narrowing the data to the assignment scope.
 */
export function evaluatePortfolioPolicy(
  context: ActorContext,
  action: PolicyAction,
  now: Date = new Date(),
): AuthorizationResult {
  const { actor } = context;
  if (!actor.isActive) return { allowed: false, reason: "inactive-actor" };
  if (actor.role === "system-admin") return { allowed: true, reason: "system-admin" };
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
  if (RESOURCE_FREE_ACTIONS.has(action)) {
    return { allowed: true, reason: "resource-free-action" };
  }
  const granted = context.assignments.some(
    (assignment) =>
      assignment.principalUserId === actor.userId &&
      assignment.accessRole === accessRole &&
      isActiveAssignment(assignment, now) &&
      assignment.permissions.includes(action),
  );
  return granted
    ? { allowed: true, reason: "portfolio-assignment" }
    : { allowed: false, reason: "no-matching-assignment" };
}

export function roleMaximumActions(role: AccessRole): PolicyAction[] {
  return [...ROLE_MAXIMUM[role]];
}

const CARETAKER_BASELINE_ACTIONS: PolicyAction[] = [
  "property:read",
  "unit:read",
  "assignment:read",
];

const CARETAKER_PRIVILEGE_ACTIONS: Record<string, PolicyAction[]> = {
  edit_property: ["property:edit"],
  manage_units: ["unit:manage"],
  manage_tenants: ["tenant:manage", "application:manage"],
  process_move_requests: ["move-request:create", "move-request:manage"],
  manage_invoices: ["invoice:read", "invoice:manage", "invoice:mark-paid", "invoice:generate"],
  manage_complaints: ["complaint:manage"],
  manage_tasks: ["task:manage"],
  manage_announcements: ["announcement:read", "announcement:manage"],
  send_messages: ["chat:read-own", "chat:send", "chat:manage"],
  manage_documents: ["document:read-own", "document:manage"],
};

const UNREPRESENTABLE_CARETAKER_PRIVILEGES = new Set([
  "create_property",
  "delete_assigned_property",
]);

/**
 * Maps a caretaker's privilege tokens to the assignment actions derived from
 * them. Returned `unrepresentable` tokens exceed the caretaker maximum and
 * must surface as warnings when staff are bound or their privileges change.
 */
export function caretakerPrivilegeActions(privileges: string[]): {
  actions: PolicyAction[];
  unrepresentable: string[];
} {
  const actions = [...CARETAKER_BASELINE_ACTIONS];
  const unrepresentable: string[] = [];

  for (const privilege of privileges) {
    if (UNREPRESENTABLE_CARETAKER_PRIVILEGES.has(privilege)) {
      unrepresentable.push(privilege);
      continue;
    }
    const mapped = CARETAKER_PRIVILEGE_ACTIONS[privilege];
    if (!mapped) {
      unrepresentable.push(privilege);
      continue;
    }
    actions.push(...mapped);
  }

  return { actions: [...new Set(actions)], unrepresentable };
}
