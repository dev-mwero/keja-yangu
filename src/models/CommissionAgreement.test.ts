import { describe, expect, it } from "vitest";
import { CommissionAgreement } from "@/models/CommissionAgreement";

describe("CommissionAgreement schema", () => {
  it("initializes with default values", () => {
    const doc = new CommissionAgreement({
      brokerId: "broker-1",
      scopeType: "property",
      scopeId: "prop-1",
      propertyId: "prop-1",
      createdByUserId: "admin-1",
    });

    expect(doc.brokerId).toBe("broker-1");
    expect(doc.scopeType).toBe("property");
    expect(doc.scopeId).toBe("prop-1");
    expect(doc.propertyId).toBe("prop-1");
    expect(doc.basis).toBe("first_month_rent");
    expect(doc.rateBps).toBe(0);
    expect(doc.fixedAmountMinor).toBe(0);
    expect(doc.currency).toBe("KES");
    expect(doc.status).toBe("draft");
    expect(doc.payerBillingAccountId).toBe("");
    expect(doc.termsAcceptedByBrokerAt).toBeNull();
  });

  it("fails validation when required fields are missing", () => {
    const doc = new CommissionAgreement({});
    const err = doc.validateSync();
    expect(err?.errors.brokerId).toBeDefined();
    expect(err?.errors.scopeType).toBeDefined();
    expect(err?.errors.scopeId).toBeDefined();
    expect(err?.errors.propertyId).toBeDefined();
    expect(err?.errors.createdByUserId).toBeDefined();
  });
});

