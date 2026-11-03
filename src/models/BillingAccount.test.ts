import { describe, expect, it } from "vitest";
import { BillingAccount } from "@/models/BillingAccount";

describe("BillingAccount schema", () => {
  it("initializes with default values", () => {
    const doc = new BillingAccount({
      ownerAdminId: "admin-1",
      legalEntityName: "Acme Properties Ltd",
      invoicePrefix: "ACME",
    });

    expect(doc.ownerAdminId).toBe("admin-1");
    expect(doc.legalEntityName).toBe("Acme Properties Ltd");
    expect(doc.invoicePrefix).toBe("ACME");
    expect(doc.status).toBe("active");
    expect(doc.defaultCurrency).toBe("KES");
    expect(doc.legacyOwnerId).toBe("");
    expect(doc.deletedAt).toBeNull();
  });

  it("fails validation when required fields are missing", () => {
    const doc = new BillingAccount({});
    const err = doc.validateSync();
    expect(err?.errors.ownerAdminId).toBeDefined();
    expect(err?.errors.legalEntityName).toBeDefined();
  });
});
