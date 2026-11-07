/**
 * Pure planning and validation logic for the owner → admin role cutover.
 * Decoupled from database side-effects so it can be verified in unit tests
 * and run safely in dry-run mode.
 */

export interface CutoverCandidateUser {
  _id: string;
  name?: string;
  email?: string;
  role: string;
  migratedFromOwner?: boolean;
}

export interface PlannedUserRoleUpdate {
  userId: string;
  name?: string;
  email?: string;
  fromRole: string;
  toRole: string;
  setMigrated: boolean;
}

/**
 * Matches the app `AuditEvent` model (src/models/AuditEvent.ts): actor +
 * entity identity, the action, and an `after` snapshot. Fields the planner
 * does not know (scope, request hashes) default in the script's schema.
 */
export interface PlannedAuditEvent {
  actorUserId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  after: Record<string, unknown>;
}

export interface UncoveredCutoverCandidate {
  userId: string;
  name?: string;
  email?: string;
}

export interface CutoverPreflight {
  /** True when every owner candidate holds at least one active assignment. */
  ready: boolean;
  /** Owner candidates with no active assignment — cutting them over would lock them out. */
  uncovered: UncoveredCutoverCandidate[];
  warnings: string[];
}

export interface RoleCutoverPlan {
  usersToUpdate: PlannedUserRoleUpdate[];
  auditEvents: PlannedAuditEvent[];
  skippedCount: number;
  warnings: string[];
}

export interface RoleRollbackPlan {
  usersToRollback: PlannedUserRoleUpdate[];
  auditEvents: PlannedAuditEvent[];
  skippedCount: number;
  warnings: string[];
}

/**
 * Plans the forward cutover from `role: "owner"` to `role: "admin"`.
 * Only users with role === "owner" are targeted. All other roles (including
 * system-admin, tenant, caretaker, custodian, and existing admin) are preserved.
 */
export function planRoleCutover(users: CutoverCandidateUser[]): RoleCutoverPlan {
  const usersToUpdate: PlannedUserRoleUpdate[] = [];
  const auditEvents: PlannedAuditEvent[] = [];
  const warnings: string[] = [];
  let skippedCount = 0;

  for (const user of users) {
    const userId = String(user._id);

    if (user.role === "owner") {
      usersToUpdate.push({
        userId,
        name: user.name,
        email: user.email,
        fromRole: "owner",
        toRole: "admin",
        setMigrated: true,
      });

      auditEvents.push({
        actorUserId: "system",
        actorRole: "system",
        action: "user.role_cutover",
        entityType: "user",
        entityId: userId,
        after: {
          fromRole: "owner",
          toRole: "admin",
          reason: "Phase 4 multi-admin role cutover",
        },
      });
    } else {
      skippedCount += 1;
      if (user.role === "admin" && user.migratedFromOwner) {
        warnings.push(`User ${userId} was already migrated from owner to admin`);
      }
    }
  }

  return {
    usersToUpdate,
    auditEvents,
    skippedCount,
    warnings,
  };
}

/**
 * Plans the rollback for users who were migrated with `migratedFromOwner: true`.
 * Directly created admins (without migratedFromOwner) are never rolled back.
 */
export function planRoleRollback(users: CutoverCandidateUser[]): RoleRollbackPlan {
  const usersToRollback: PlannedUserRoleUpdate[] = [];
  const auditEvents: PlannedAuditEvent[] = [];
  const warnings: string[] = [];
  let skippedCount = 0;

  for (const user of users) {
    const userId = String(user._id);

    if (user.role === "admin" && user.migratedFromOwner) {
      usersToRollback.push({
        userId,
        name: user.name,
        email: user.email,
        fromRole: "admin",
        toRole: "owner",
        setMigrated: false,
      });

      auditEvents.push({
        actorUserId: "system",
        actorRole: "system",
        action: "user.role_rollback",
        entityType: "user",
        entityId: userId,
        after: {
          fromRole: "admin",
          toRole: "owner",
          reason: "Rollback of Phase 4 multi-admin role cutover",
        },
      });
    } else {
      skippedCount += 1;
      if (user.role === "admin" && !user.migratedFromOwner) {
        warnings.push(`Admin ${userId} was created natively and cannot be rolled back to owner`);
      }
    }
  }

  return {
    usersToRollback,
    auditEvents,
    skippedCount,
    warnings,
  };
}

/**
 * Preflight gate for the forward cutover. Admin access is assignment-scoped
 * (`ManagementAssignment`): a user promoted from `owner` to `admin` without at
 * least one active assignment loses every dashboard capability. Fail closed —
 * the caller must not apply the cutover while `ready` is false; create
 * assignments for the uncovered owners first.
 *
 * `activeAssignmentUserIds` is the set of principal user ids holding an active,
 * in-window assignment (computed by the caller from `ManagementAssignment`).
 */
export function planCutoverPreflight(
  users: CutoverCandidateUser[],
  activeAssignmentUserIds: ReadonlySet<string>,
): CutoverPreflight {
  const uncovered: UncoveredCutoverCandidate[] = [];
  const warnings: string[] = [];

  for (const user of users) {
    if (user.role !== "owner") continue;
    const userId = String(user._id);
    if (!activeAssignmentUserIds.has(userId)) {
      uncovered.push({ userId, name: user.name, email: user.email });
      warnings.push(
        `Owner ${userId} has no active management assignment; promoting them to admin would lock them out of the dashboard`,
      );
    }
  }

  return { ready: uncovered.length === 0, uncovered, warnings };
}
