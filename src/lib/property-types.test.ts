import { describe, expect, it } from "vitest";
import { PROPERTY_TYPES, PROPERTY_TYPE_LABELS } from "@/lib/property-types";

describe("property types", () => {
  it("is the apartment/villa/bungalow set", () => {
    expect(PROPERTY_TYPES).toEqual(["apartment", "villa", "bungalow"]);
  });

  it("has a human label for every type", () => {
    for (const type of PROPERTY_TYPES) {
      expect(PROPERTY_TYPE_LABELS[type]).toBeTruthy();
    }
  });
});
