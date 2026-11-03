import { describe, expect, it } from "vitest";
import { Attribution } from "@/models/Attribution";

describe("Attribution schema", () => {
  it("initializes with default values", () => {
    const doc = new Attribution({
      unitId: "unit-1",
      propertyId: "prop-1",
    });

    expect(doc.unitId).toBe("unit-1");
    expect(doc.propertyId).toBe("prop-1");
    expect(doc.source).toBe("direct");
    expect(doc.status).toBe("provisional");
    expect(doc.applicationId).toBe("");
    expect(doc.leaseId).toBe("");
    expect(doc.lockedAt).toBeNull();
    expect(doc.confirmedAt).toBeNull();
    expect(doc.supersededByAttributionId).toBe("");
  });

  it("fails validation when required fields are missing", () => {
    const doc = new Attribution({});
    const err = doc.validateSync();
    expect(err?.errors.unitId).toBeDefined();
    expect(err?.errors.propertyId).toBeDefined();
  });
});
