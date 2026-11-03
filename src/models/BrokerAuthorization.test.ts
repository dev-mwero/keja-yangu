import { describe, expect, it } from "vitest";
import { BrokerAuthorization } from "@/models/BrokerAuthorization";

describe("BrokerAuthorization schema", () => {
  it("initializes with default values", () => {
    const doc = new BrokerAuthorization({
      brokerId: "broker-1",
      scopeType: "property",
      scopeId: "prop-1",
      propertyId: "prop-1",
      grantedByUserId: "admin-1",
    });

    expect(doc.brokerId).toBe("broker-1");
    expect(doc.scopeType).toBe("property");
    expect(doc.scopeId).toBe("prop-1");
    expect(doc.propertyId).toBe("prop-1");
    expect(doc.status).toBe("active");
    expect(doc.grantedByUserId).toBe("admin-1");
    expect(doc.validTo).toBeNull();
    expect(doc.notes).toBe("");
  });

  it("fails validation when required fields are missing", () => {
    const doc = new BrokerAuthorization({});
    const err = doc.validateSync();
    expect(err?.errors.brokerId).toBeDefined();
    expect(err?.errors.scopeType).toBeDefined();
    expect(err?.errors.scopeId).toBeDefined();
    expect(err?.errors.propertyId).toBeDefined();
    expect(err?.errors.grantedByUserId).toBeDefined();
  });
});

