/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { planCutoverPreflight, planRoleCutover, planRoleRollback } from "@/lib/role-cutover";

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
      actorUserId: "system",
      actorRole: "system",
      action: "user.role_cutover",
      entityType: "user",
      entityId: "u1",
      after: {
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

describe("planCutoverPreflight", () => {
  const users = [
    { _id: "u1", name: "Alice Owner", email: "alice@keja.co", role: "owner" },
    { _id: "u2", name: "Bob Owner", email: "bob@keja.co", role: "owner" },
    { _id: "u3", name: "Carol Admin", role: "admin" },
    { _id: "u4", name: "Dan Tenant", role: "tenant" },
  ];

  it("is ready when every owner holds an active assignment", () => {
    const preflight = planCutoverPreflight(users, new Set(["u1", "u2"]));
    expect(preflight.ready).toBe(true);
    expect(preflight.uncovered).toEqual([]);
    expect(preflight.warnings).toEqual([]);
  });

  it("blocks when an owner has no active assignment (would lock them out)", () => {
    const preflight = planCutoverPreflight(users, new Set(["u1"]));
    expect(preflight.ready).toBe(false);
    expect(preflight.uncovered).toEqual([
      { userId: "u2", name: "Bob Owner", email: "bob@keja.co" },
    ]);
    expect(preflight.warnings.some((w) => w.includes("u2"))).toBe(true);
  });

  it("ignores non-owner users entirely", () => {
    const preflight = planCutoverPreflight(users, new Set());
    expect(preflight.uncovered.map((u) => u.userId)).toEqual(["u1", "u2"]);
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
