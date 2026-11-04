import { describe, expect, it } from "vitest";
import { buildLegacyReadinessReport, type LegacyReadinessInput } from "@/lib/legacy-readiness";

const NOW = new Date("2026-11-04T00:00:00.000Z");

function baseInput(): LegacyReadinessInput {
  return {
    now: NOW,
    properties: [{ _id: "prop-1", ownerId: "", caretakerIds: [], custodianIds: [] }],
    users: [
      { _id: "admin-1", role: "admin", isActive: true, managedByOwnerId: "" },
      { _id: "caretaker-1", role: "caretaker", isActive: true, managedByOwnerId: "" },
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

  it("reports legacy references and owner-role users as blocking", () => {
    const input = baseInput();
    input.properties[0].ownerId = "owner-1";
    input.properties[0].caretakerIds = ["caretaker-1"];
    input.properties[0].custodianIds = ["custodian-1"];
    input.users.push({
      _id: "owner-1",
      role: "owner",
      isActive: true,
      managedByOwnerId: "legacy-owner",
    });

    const report = buildLegacyReadinessReport(input);

    expect(report.readyForLegacyRetirement).toBe(false);
    expect(report.counts.propertiesWithLegacyOwner).toBe(1);
    expect(report.counts.propertiesWithLegacyCaretakers).toBe(1);
    expect(report.counts.propertiesWithLegacyCustodians).toBe(1);
    expect(report.counts.usersWithLegacyManager).toBe(1);
    expect(report.blocking.ownerRoleUsers).toEqual(["owner-1"]);
    expect(report.blocking.ownersWithoutAssignment).toEqual([
      { propertyId: "prop-1", ownerId: "owner-1" },
    ]);
  });

  it("accepts a legacy owner that already has an active admin assignment", () => {
    const input = baseInput();
    input.properties[0].ownerId = "admin-1";
    input.users = [{ _id: "admin-1", role: "admin", isActive: true }];

    const report = buildLegacyReadinessReport(input);

    expect(report.blocking.ownersWithoutAssignment).toEqual([]);
    expect(report.readyForLegacyRetirement).toBe(false);
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
      },
      {
        _id: "asg-block",
        principalUserId: "admin-1",
        accessRole: "caretaker",
        scopeType: "block",
        propertyId: "prop-1",
        blockId: "missing-block",
      },
      {
        _id: "asg-unit",
        principalUserId: "admin-1",
        accessRole: "caretaker",
        scopeType: "unit",
        propertyId: "prop-1",
        unitId: "missing-unit",
      },
    ];

    const report = buildLegacyReadinessReport(input);

    expect(report.blocking.orphanAssignments).toEqual([
      { assignmentId: "asg-orphan", propertyId: "missing-prop" },
    ]);
    expect(report.blocking.missingBlockAssignments).toEqual([
      { assignmentId: "asg-block", blockId: "missing-block" },
    ]);
    expect(report.blocking.missingUnitAssignments).toEqual([
      { assignmentId: "asg-unit", unitId: "missing-unit" },
    ]);
    expect(report.readyForLegacyRetirement).toBe(false);
  });

  it("flags units pointing at missing or inactive billing accounts", () => {
    const input = baseInput();
    input.units.push(
      { _id: "unit-2", propertyId: "prop-1", billingAccountId: "missing-ba" },
      { _id: "unit-3", propertyId: "prop-1", billingAccountId: "ba-closed" },
    );
    input.billingAccounts.push({ _id: "ba-closed", status: "closed" });

    const report = buildLegacyReadinessReport(input);

    expect(report.blocking.unitBillingDrift).toEqual([
      { unitId: "unit-2", billingAccountId: "missing-ba" },
      { unitId: "unit-3", billingAccountId: "ba-closed" },
    ]);
  });

  it("ignores soft-deleted properties, units, blocks and billing accounts", () => {
    const input = baseInput();
    input.properties.push({ _id: "prop-deleted", ownerId: "owner-1", deletedAt: NOW });
    input.units.push({
      _id: "unit-deleted",
      propertyId: "prop-1",
      billingAccountId: "missing-ba",
      deletedAt: NOW,
    });
    input.blocks.push({ _id: "block-deleted", propertyId: "prop-1", deletedAt: NOW });
    input.billingAccounts.push({ _id: "ba-deleted", status: "closed", deletedAt: NOW });

    const report = buildLegacyReadinessReport(input);

    expect(report.counts.propertiesWithLegacyOwner).toBe(0);
    expect(report.blocking.unitBillingDrift).toEqual([]);
    expect(report.readyForLegacyRetirement).toBe(true);
  });
});
