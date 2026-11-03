import { describe, expect, it } from "vitest";
import { BrokerProfile } from "@/models/BrokerProfile";

describe("BrokerProfile schema", () => {
  it("initializes with default values", () => {
    const doc = new BrokerProfile({
      userId: "user-1",
      phone: "+254711000000",
      email: "broker@example.com",
    });

    expect(doc.userId).toBe("user-1");
    expect(doc.phone).toBe("+254711000000");
    expect(doc.email).toBe("broker@example.com");
    expect(doc.status).toBe("pending");
    expect(doc.counties).toEqual([]);
    expect(doc.specialties).toEqual([]);
    expect(doc.payoutMethod?.payoutType).toBe("none");
    expect(doc.verifiedByUserId).toBe("");
    expect(doc.verifiedAt).toBeNull();
  });

  it("fails validation when required fields are missing", () => {
    const doc = new BrokerProfile({});
    const err = doc.validateSync();
    expect(err?.errors.userId).toBeDefined();
    expect(err?.errors.phone).toBeDefined();
    expect(err?.errors.email).toBeDefined();
  });
});

