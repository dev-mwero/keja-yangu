import { describe, expect, it } from "vitest";
import { planListingBackfill } from "@/lib/listing-backfill";

describe("planListingBackfill", () => {
  const property = {
    _id: "prop-1",
    title: "Kilimani Heights",
    price: 30000,
    images: ["https://example.com/img1.jpg"],
    amenities: ["WiFi", "Parking"],
  };

  it("plans draft listings for vacant units", () => {
    const units = [
      {
        _id: "unit-1",
        propertyId: "prop-1",
        name: "1A",
        rent: 32000,
        status: "available",
      },
    ];

    const result = planListingBackfill({
      units,
      properties: [property],
      existingListings: [],
      activeLeases: [],
      canonicalPublisherUserId: "admin-1",
    });

    expect(result.plannedListings).toHaveLength(1);
    expect(result.plannedListings[0].unitId).toBe("unit-1");
    expect(result.plannedListings[0].headline).toBe(
      "Kilimani Heights - Unit 1A",
    );
    expect(result.plannedListings[0].askingRent).toBe(32000);
    expect(result.plannedListings[0].state).toBe("draft");
    expect(result.skippedUnits).toHaveLength(0);
  });

  it("skips occupied units and units with active leases", () => {
    const units = [
      {
        _id: "unit-1",
        propertyId: "prop-1",
        name: "1A",
        status: "occupied",
      },
      {
        _id: "unit-2",
        propertyId: "prop-1",
        name: "1B",
        status: "available",
      },
    ];

    const result = planListingBackfill({
      units,
      properties: [property],
      existingListings: [],
      activeLeases: [{ unitId: "unit-2", status: "active" }],
      canonicalPublisherUserId: "admin-1",
    });

    expect(result.plannedListings).toHaveLength(0);
    expect(result.skippedUnits).toHaveLength(2);
    expect(result.skippedUnits[0].reason).toBe("Unit is currently occupied");
    expect(result.skippedUnits[1].reason).toBe("Unit is currently occupied");
  });

  it("skips units that already have an in-flight listing", () => {
    const units = [
      {
        _id: "unit-1",
        propertyId: "prop-1",
        name: "1A",
        status: "available",
      },
    ];

    const result = planListingBackfill({
      units,
      properties: [property],
      existingListings: [{ unitId: "unit-1", state: "active" }],
      activeLeases: [],
      canonicalPublisherUserId: "admin-1",
    });

    expect(result.plannedListings).toHaveLength(0);
    expect(result.skippedUnits).toHaveLength(1);
    expect(result.skippedUnits[0].reason).toBe(
      "Already has active or draft listing",
    );
  });

  it("warns when rent is missing or zero", () => {
    const units = [
      {
        _id: "unit-1",
        propertyId: "prop-1",
        name: "1A",
        status: "available",
        rent: 0,
      },
    ];

    const propNoPrice = { ...property, price: 0 };
    const result = planListingBackfill({
      units,
      properties: [propNoPrice],
      existingListings: [],
      activeLeases: [],
      canonicalPublisherUserId: "admin-1",
    });

    expect(result.plannedListings).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("zero or unset rent");
  });
});

