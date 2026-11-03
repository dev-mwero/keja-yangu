import { describe, expect, it } from "vitest";
import { UnitBillingAssignment } from "@/models/UnitBillingAssignment";

describe("UnitBillingAssignment schema", () => {
  it("initializes with default values", () => {
    const doc = new UnitBillingAssignment({
      unitId: "unit-1",
      billingAccountId: "ba-1",
      assignedByUserId: "admin-1",
    });

    expect(doc.unitId).toBe("unit-1");
    expect(doc.billingAccountId).toBe("ba-1");
    expect(doc.assignedByUserId).toBe("admin-1");
    expect(doc.status).toBe("active");
    expect(doc.effectiveTo).toBeNull();
    expect(doc.reason).toBe("");
    expect(doc.legacyOwnerId).toBe("");
    expect(doc.effectiveFrom).toBeInstanceOf(Date);
  });

  it("fails validation when required fields are missing", () => {
    const doc = new UnitBillingAssignment({});
    const err = doc.validateSync();
    expect(err?.errors.unitId).toBeDefined();
    expect(err?.errors.billingAccountId).toBeDefined();
    expect(err?.errors.assignedByUserId).toBeDefined();
  });
});
