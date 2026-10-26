import { describe, expect, it } from "vitest";
import { effectivePurpose, effectiveRent } from "./structure";

describe("structure helpers", () => {
  describe("effectiveRent", () => {
    it("returns unit rent if set", () => {
      expect(effectiveRent(50000, 45000, 40000, 35000)).toBe(50000);
    });

    it("falls back to floor rent override", () => {
      expect(effectiveRent(null, 45000, 40000, 35000)).toBe(45000);
    });

    it("falls back to block rent override", () => {
      expect(effectiveRent(null, null, 40000, 35000)).toBe(40000);
    });

    it("falls back to property rent", () => {
      expect(effectiveRent(null, null, null, 35000)).toBe(35000);
    });
  });

  describe("effectivePurpose", () => {
    it("returns unit purpose when explicitly specified", () => {
      expect(effectivePurpose("storage", "commercial", "other", "residential")).toBe("storage");
    });

    it("falls back to floor purpose when unit purpose is null/undefined", () => {
      expect(effectivePurpose(null, "commercial", "other", "residential")).toBe("commercial");
      expect(effectivePurpose(undefined, "commercial", "other", "residential")).toBe("commercial");
    });

    it("falls back to block purpose when floor purpose is null/undefined", () => {
      expect(effectivePurpose(null, null, "other", "residential")).toBe("other");
    });

    it("falls back to property purpose when block purpose is null/undefined", () => {
      expect(effectivePurpose(null, null, null, "commercial")).toBe("commercial");
    });

    it("defaults to 'residential' when nothing in the hierarchy specifies purpose", () => {
      expect(effectivePurpose(null, null, null, null)).toBe("residential");
      expect(effectivePurpose()).toBe("residential");
    });
  });
});

