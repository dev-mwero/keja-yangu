import { describe, expect, it } from "vitest";
import {
  PROPERTY_TYPE_LABELS,
  PROPERTY_TYPES,
  propertyTypeLabel,
  slugifyPropertyTypeKey,
} from "@/lib/property-types";

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

describe("slugifyPropertyTypeKey", () => {
  it("turns a label into a stable, lower-kebab key", () => {
    expect(slugifyPropertyTypeKey("Town House")).toBe("town-house");
    expect(slugifyPropertyTypeKey("  Bedsitter / Studio ")).toBe("bedsitter-studio");
  });

  it("returns an empty string when nothing usable remains", () => {
    expect(slugifyPropertyTypeKey("  ")).toBe("");
    expect(slugifyPropertyTypeKey("!!!")).toBe("");
  });
});

describe("propertyTypeLabel", () => {
  it("falls back to the built-in label then the raw key", () => {
    expect(propertyTypeLabel("villa")).toBe("Villa");
    expect(propertyTypeLabel("houseboat")).toBe("houseboat");
  });

  it("prefers labels supplied by the caller", () => {
    expect(propertyTypeLabel("houseboat", { houseboat: "Houseboat" })).toBe("Houseboat");
    expect(propertyTypeLabel("houseboat", new Map([["houseboat", "Floating Home"]]))).toBe(
      "Floating Home",
    );
  });
});
