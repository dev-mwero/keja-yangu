import { describe, expect, it } from "vitest";
import { Listing } from "@/models/Listing";

describe("Listing schema", () => {
  it("initializes with default values", () => {
    const doc = new Listing({
      propertyId: "prop-1",
      unitId: "unit-1",
      headline: "Modern 2BHK Apartment",
      askingRent: 35000,
      canonicalPublisherUserId: "admin-1",
      createdByUserId: "admin-1",
    });

    expect(doc.propertyId).toBe("prop-1");
    expect(doc.blockId).toBe("");
    expect(doc.unitId).toBe("unit-1");
    expect(doc.state).toBe("draft");
    expect(doc.headline).toBe("Modern 2BHK Apartment");
    expect(doc.description).toBe("");
    expect(doc.askingRent).toBe(35000);
    expect(doc.serviceCharge).toBe(0);
    expect(doc.depositMonths).toBe(1);
    expect(doc.minimumStayMonths).toBe(1);
    expect(doc.amenities).toEqual([]);
    expect(doc.media).toEqual([]);
    expect(doc.visibility).toBe("public");
    expect(doc.canonicalPublisherUserId).toBe("admin-1");
    expect(doc.verifiedByUserId).toBe("");
    expect(doc.verifiedAt).toBeNull();
    expect(doc.publishedAt).toBeNull();
    expect(doc.expiresAt).toBeNull();
    expect(doc.version).toBe(1);
    expect(doc.createdByUserId).toBe("admin-1");
    expect(doc.deletedAt).toBeNull();
  });

  it("fails validation when required fields are missing", () => {
    const doc = new Listing({});
    const err = doc.validateSync();
    expect(err?.errors.propertyId).toBeDefined();
    expect(err?.errors.unitId).toBeDefined();
    expect(err?.errors.headline).toBeDefined();
    expect(err?.errors.askingRent).toBeDefined();
    expect(err?.errors.canonicalPublisherUserId).toBeDefined();
    expect(err?.errors.createdByUserId).toBeDefined();
  });

  it("fails validation when askingRent is negative", () => {
    const doc = new Listing({
      propertyId: "prop-1",
      unitId: "unit-1",
      headline: "Apartment",
      askingRent: -100,
      canonicalPublisherUserId: "admin-1",
      createdByUserId: "admin-1",
    });
    const err = doc.validateSync();
    expect(err?.errors.askingRent).toBeDefined();
  });
});
