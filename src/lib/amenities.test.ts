import { describe, expect, it } from "vitest";
import { AMENITY_OPTIONS, normalizeAmenities } from "@/lib/amenities";

describe("AMENITY_OPTIONS", () => {
  it("exposes unique ids and labels", () => {
    const ids = AMENITY_OPTIONS.map((a) => a.id);
    const labels = AMENITY_OPTIONS.map((a) => a.label.toLowerCase());
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("includes common options", () => {
    const labels = AMENITY_OPTIONS.map((a) => a.label);
    expect(labels).toContain("Swimming Pool");
    expect(labels).toContain("Basketball Court");
  });
});

describe("normalizeAmenities", () => {
  it("trims, drops blanks and de-duplicates case-insensitively", () => {
    expect(normalizeAmenities(["  Wi-Fi ", "WI-FI", "", "Gym", "GYM"])).toEqual(["Wi-Fi", "Gym"]);
  });

  it("preserves first-seen order and casing", () => {
    expect(normalizeAmenities(["Pool", "Gym", "pool"])).toEqual(["Pool", "Gym"]);
  });
});
