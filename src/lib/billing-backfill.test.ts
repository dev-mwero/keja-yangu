/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { planBillingBackfill } from "@/lib/billing-backfill";

describe("planBillingBackfill", () => {
  it("plans billing accounts, unit assignments, and entity updates", () => {
    const input = {
      owners: [{ _id: "owner-1", name: "Alice Owner" }],
      units: [{ _id: "u1", ownerId: "owner-1" }],
      leases: [{ _id: "l1", unitId: "u1", ownerId: "owner-1" }],
      invoices: [{ _id: "inv1", leaseId: "l1", ownerId: "owner-1" }],
      payments: [{ _id: "pay1", invoiceId: "inv1", ownerId: "owner-1" }],
    };

    const plan = planBillingBackfill(input);

    expect(plan.billingAccounts).toEqual([
      {
        ownerAdminId: "owner-1",
        legalEntityName: "Alice Owner",
        invoicePrefix: "INV",
        legacyOwnerId: "owner-1",
      },
    ]);
    expect(plan.unitAssignments).toEqual([
      {
        unitId: "u1",
        ownerAdminId: "owner-1",
        reason: "Phase 3 initial backfill from legacy owner",
      },
    ]);
    expect(plan.leaseUpdates).toHaveLength(1);
    expect(plan.invoiceUpdates).toHaveLength(1);
    expect(plan.paymentUpdates).toHaveLength(1);
    expect(plan.warnings).toHaveLength(0);
  });

  it("warns about units with missing ownerId", () => {
    const input = {
      owners: [],
      units: [{ _id: "u1", ownerId: "" }],
      leases: [],
      invoices: [],
      payments: [],
    };

    const plan = planBillingBackfill(input);
    expect(plan.warnings).toContain("Unit u1 has no ownerId");
  });
});
