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

export interface PlannedAuditEvent {
  action: string;
  actorId: string;
  targetId: string;
  details: Record<string, unknown>;
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
        action: "user.role_cutover",
        actorId: "system",
        targetId: userId,
        details: {
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
        action: "user.role_rollback",
        actorId: "system",
        targetId: userId,
        details: {
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
