import { describe, expect, it } from "vitest";
import { buildLegacyReadinessReport, type LegacyReadinessInput } from "@/lib/legacy-readiness";

const NOW = new Date("2026-11-04T00:00:00.000Z");

function baseInput(): LegacyReadinessInput {
  return {
    now: NOW,
    properties: [{ _id: "prop-1", ownerId: "" }],
    users: [
      { _id: "admin-1", role: "admin", isActive: true },
      { _id: "caretaker-1", role: "caretaker", isActive: true },
    ],
    assignments: [
      {
        _id: "asg-1",
        principalUserId: "admin-1",
        accessRole: "admin",
        scopeType: "property",
        propertyId: "prop-1",
        blockId: "",
        unitId: "",
      },
    ],
    units: [{ _id: "unit-1", propertyId: "prop-1", blockId: "block-1", billingAccountId: "ba-1" }],
    blocks: [{ _id: "block-1", propertyId: "prop-1" }],
    billingAccounts: [{ _id: "ba-1", status: "active" }],
  };
}

describe("legacy readiness", () => {
  it("is ready when no legacy references or drift remain", () => {
    const report = buildLegacyReadinessReport(baseInput());

    expect(report.readyForLegacyRetirement).toBe(true);
    expect(report.counts.activeAssignments).toBe(1);
    expect(report.generatedAt).toBe(NOW.toISOString());
    expect(report.blocking.ownerRoleUsers).toEqual([]);
  });

  it("reports legacy owner-role users as blocking", () => {
    const input = baseInput();
    input.properties[0].ownerId = "owner-1";
    input.users.push({
      _id: "owner-1",
      role: "owner",
      isActive: true,
    });

    const report = buildLegacyReadinessReport(input);

    expect(report.readyForLegacyRetirement).toBe(false);
    expect(report.counts.propertiesWithLegacyOwner).toBe(1);
    expect(report.blocking.ownerRoleUsers).toEqual(["owner-1"]);
    expect(report.blocking.ownersWithoutAssignment).toEqual([
      { propertyId: "prop-1", ownerId: "owner-1" },
    ]);
  });

  it("accepts a property owner that already has an active admin assignment", () => {
    const input = baseInput();
    input.properties[0].ownerId = "admin-1";
    input.users = [{ _id: "admin-1", role: "admin", isActive: true }];

    const report = buildLegacyReadinessReport(input);

    expect(report.blocking.ownersWithoutAssignment).toEqual([]);
    expect(report.readyForLegacyRetirement).toBe(true);
    expect(report.counts.propertiesWithLegacyOwner).toBe(1);
  });

  it("flags orphan, block and unit assignment drift", () => {
    const input = baseInput();
    input.assignments = [
      ...input.assignments,
      {
        _id: "asg-orphan",
        principalUserId: "admin-1",
        accessRole: "custodian",
        scopeType: "property",
        propertyId: "missing-prop",
        blockId: "",
        unitId: "",
      },
      {
        _id: "asg-block",
        principalUserId: "admin-1",
        accessRole: "caretaker",
        scopeType: "block",
        propertyId: "prop-1",
        blockId: "missing-block",
        unitId: "",
      },
      {
        _id: "asg-unit",
        principalUserId: "admin-1",
        accessRole: "caretaker",
        scopeType: "unit",
        propertyId: "prop-1",
        blockId: "",
        unitId: "missing-unit",
      },
    ];

    const report = buildLegacyReadinessReport(input);

    expect(report.readyForLegacyRetirement).toBe(false);
    expect(report.blocking.orphanAssignments).toHaveLength(1);
    expect(report.blocking.missingBlockAssignments).toHaveLength(1);
    expect(report.blocking.missingUnitAssignments).toHaveLength(1);
  });
});
