/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { caretakerMigrationActions, planAssignmentBackfill } from "@/lib/assignment-backfill";
import { roleMaximumActions } from "@/lib/authorization";
import { makeObjectId } from "@/test/utils/factories";

const NOW = new Date("2026-11-02T00:00:00.000Z");
const OWNER_ID = makeObjectId("owner");
const CUSTODIAN_ID = makeObjectId("custodian");
const CARETAKER_ID = makeObjectId("caretaker");
const PROPERTY_ID = makeObjectId("property");

function user(id: string, role: string, overrides: Record<string, unknown> = {}) {
  return { _id: id, role, isActive: true, privileges: [], ...overrides };
}

describe("caretakerMigrationActions", () => {
  it("maps current privileges to target actions and keeps read baseline", () => {
    const result = caretakerMigrationActions([
      "edit_property",
      "manage_units",
      "manage_tenants",
      "manage_invoices",
    ]);
    expect(result.actions).toEqual(
      expect.arrayContaining([
        "property:read",
        "unit:read",
        "assignment:read",
        "property:edit",
        "unit:manage",
        "tenant:manage",
        "application:manage",
        "invoice:read",
        "invoice:manage",
        "invoice:mark-paid",
        "invoice:generate",
      ]),
    );
    expect(result.unrepresentable).toEqual([]);
  });

  it("reports privileges that exceed the caretaker maximum", () => {
    expect(caretakerMigrationActions(["create_property", "delete_assigned_property"])).toEqual({
      actions: ["property:read", "unit:read", "assignment:read"],
      unrepresentable: ["create_property", "delete_assigned_property"],
    });
  });
});

describe("planAssignmentBackfill", () => {
  const users = [
    user(OWNER_ID, "owner"),
    user(CUSTODIAN_ID, "custodian"),
    user(CARETAKER_ID, "caretaker", { privileges: ["manage_units", "create_property"] }),
  ];

  it("creates owner, custodian and caretaker property assignments", () => {
    const plan = planAssignmentBackfill({
      properties: [
        {
          _id: PROPERTY_ID,
          ownerId: OWNER_ID,
          custodianIds: [CUSTODIAN_ID],
          caretakerIds: [CARETAKER_ID],
        },
      ],
      users,
      now: NOW,
    });

    expect(plan.assignments).toHaveLength(3);
    expect(plan.assignments.find((a) => a.accessRole === "admin")).toMatchObject({
      principalUserId: OWNER_ID,
      scopeType: "property",
      propertyId: PROPERTY_ID,
      status: "active",
      source: "migration",
      legacyOwnerId: OWNER_ID,
      permissions: roleMaximumActions("admin"),
    });
    expect(plan.assignments.find((a) => a.accessRole === "custodian")?.permissions).toEqual(
      roleMaximumActions("custodian"),
    );
    expect(plan.assignments.find((a) => a.accessRole === "caretaker")?.permissions).toEqual(
      expect.arrayContaining(["unit:manage", "property:read"]),
    );
    expect(plan.warnings).toEqual([
      {
        code: "unrepresentable-privilege",
        principalUserId: CARETAKER_ID,
        propertyId: PROPERTY_ID,
        privilege: "create_property",
      },
    ]);
  });

  it("maps owner-role users to admin assignments", () => {
    const plan = planAssignmentBackfill({
      properties: [{ _id: PROPERTY_ID, ownerId: OWNER_ID }],
      users,
      now: NOW,
    });
    expect(plan.assignments[0].accessRole).toBe("admin");
  });

  it("skips staff whose stored role does not match the property array", () => {
    const plan = planAssignmentBackfill({
      properties: [
        {
          _id: PROPERTY_ID,
          ownerId: OWNER_ID,
          custodianIds: [CARETAKER_ID],
          caretakerIds: [CUSTODIAN_ID],
        },
      ],
      users,
      now: NOW,
    });
    expect(plan.assignments).toHaveLength(1);
    expect(plan.warnings.map((w) => w.code)).toEqual(["role-mismatch", "role-mismatch"]);
  });

  it("warns about missing or invalid owners without skipping the admin assignment", () => {
    const plan = planAssignmentBackfill({
      properties: [{ _id: PROPERTY_ID }],
      users,
      now: NOW,
    });
    expect(plan.assignments).toHaveLength(0);
    expect(plan.warnings[0]).toMatchObject({ code: "missing-owner", propertyId: PROPERTY_ID });

    const invalid = planAssignmentBackfill({
      properties: [{ _id: PROPERTY_ID, ownerId: "not-an-id" }],
      users,
      now: NOW,
    });
    expect(invalid.assignments).toHaveLength(0);
    expect(invalid.warnings[0]).toMatchObject({ code: "invalid-principal" });
  });

  it("reports a missing owner user but still creates the admin assignment", () => {
    const missingId = makeObjectId("missing-owner");
    const plan = planAssignmentBackfill({
      properties: [{ _id: PROPERTY_ID, ownerId: missingId }],
      users: [],
      now: NOW,
    });
    expect(plan.assignments).toHaveLength(1);
    expect(plan.warnings[0]).toMatchObject({
      code: "owner-user-missing",
      principalUserId: missingId,
    });
  });

  it("deduplicates the same principal, role and property", () => {
    const plan = planAssignmentBackfill({
      properties: [
        { _id: PROPERTY_ID, ownerId: OWNER_ID, caretakerIds: [CARETAKER_ID] },
        { _id: PROPERTY_ID, ownerId: OWNER_ID, caretakerIds: [CARETAKER_ID] },
      ],
      users,
      now: NOW,
    });
    expect(plan.assignments).toHaveLength(2);
    expect(plan.warnings.filter((w) => w.code === "duplicate")).toHaveLength(2);
  });

  it("skips inactive staff", () => {
    const plan = planAssignmentBackfill({
      properties: [{ _id: PROPERTY_ID, ownerId: OWNER_ID, caretakerIds: [CARETAKER_ID] }],
      users: [user(OWNER_ID, "owner"), user(CARETAKER_ID, "caretaker", { isActive: false })],
      now: NOW,
    });
    expect(plan.assignments).toHaveLength(1);
    expect(plan.warnings[0]).toMatchObject({
      code: "inactive-user",
      principalUserId: CARETAKER_ID,
    });
  });
});
