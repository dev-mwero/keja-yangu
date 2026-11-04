/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { planRoleCutover, planRoleRollback } from "@/lib/role-cutover";

describe("planRoleCutover", () => {
  it("plans cutover for owner users and emits audit events", () => {
    const input = [
      { _id: "u1", name: "Alice Owner", role: "owner" },
      { _id: "u2", name: "Bob Tenant", role: "tenant" },
      { _id: "u3", name: "Charlie Caretaker", role: "caretaker" },
      { _id: "u4", name: "Dana Admin", role: "admin" },
      { _id: "u5", name: "Eve System Admin", role: "system-admin" },
    ];

    const plan = planRoleCutover(input);

    expect(plan.usersToUpdate).toHaveLength(1);
    expect(plan.usersToUpdate[0]).toEqual({
      userId: "u1",
      name: "Alice Owner",
      email: undefined,
      fromRole: "owner",
      toRole: "admin",
      setMigrated: true,
    });
    expect(plan.auditEvents).toHaveLength(1);
    expect(plan.auditEvents[0]).toEqual({
      action: "user.role_cutover",
      actorId: "system",
      targetId: "u1",
      details: {
        fromRole: "owner",
        toRole: "admin",
        reason: "Phase 4 multi-admin role cutover",
      },
    });
    expect(plan.skippedCount).toBe(4);
    expect(plan.warnings).toHaveLength(0);
  });

  it("warns when a user was already cut over", () => {
    const input = [{ _id: "u1", name: "Already Migrated", role: "admin", migratedFromOwner: true }];

    const plan = planRoleCutover(input);
    expect(plan.usersToUpdate).toHaveLength(0);
    expect(plan.skippedCount).toBe(1);
    expect(plan.warnings).toContain("User u1 was already migrated from owner to admin");
  });
});

describe("planRoleRollback", () => {
  it("only rolls back users who were migratedFromOwner", () => {
    const input = [
      { _id: "u1", name: "Migrated Admin", role: "admin", migratedFromOwner: true },
      { _id: "u2", name: "Native Admin", role: "admin", migratedFromOwner: false },
      { _id: "u3", name: "Tenant", role: "tenant" },
    ];

    const plan = planRoleRollback(input);

    expect(plan.usersToRollback).toHaveLength(1);
    expect(plan.usersToRollback[0]).toEqual({
      userId: "u1",
      name: "Migrated Admin",
      email: undefined,
      fromRole: "admin",
      toRole: "owner",
      setMigrated: false,
    });
    expect(plan.auditEvents).toHaveLength(1);
    expect(plan.skippedCount).toBe(2);
    expect(plan.warnings).toContain(
      "Admin u2 was created natively and cannot be rolled back to owner",
    );
  });
});
