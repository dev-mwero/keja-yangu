import { describe, expect, it } from "vitest";
import {
  assertUniqueUnitNames,
  buildUnitNames,
  defaultUnitName,
  floorPrefix,
  letterLabel,
} from "@/lib/unit-naming";

describe("letterLabel", () => {
  it("maps the first 26 indices to A..Z", () => {
    expect(letterLabel(0)).toBe("A");
    expect(letterLabel(1)).toBe("B");
    expect(letterLabel(25)).toBe("Z");
  });

  it("rolls over past Z like a spreadsheet", () => {
    expect(letterLabel(26)).toBe("AA");
    expect(letterLabel(27)).toBe("AB");
    expect(letterLabel(51)).toBe("AZ");
    expect(letterLabel(52)).toBe("BA");
  });

  it("rejects negative or non-finite input", () => {
    expect(() => letterLabel(-1)).toThrow();
    expect(() => letterLabel(Number.NaN)).toThrow();
  });
});

describe("floorPrefix", () => {
  it("uses G for ground and below", () => {
    expect(floorPrefix(0)).toBe("G");
    expect(floorPrefix(-1)).toBe("G");
  });

  it("uses the digit for upper floors", () => {
    expect(floorPrefix(3)).toBe("3");
    expect(floorPrefix(12)).toBe("12");
  });
});

describe("defaultUnitName", () => {
  it("names ground floor units GA, GB", () => {
    expect(defaultUnitName(0, 0)).toBe("GA");
    expect(defaultUnitName(0, 1)).toBe("GB");
  });

  it("names upper floor units by digit + letter", () => {
    expect(defaultUnitName(3, 0)).toBe("3A");
    expect(defaultUnitName(3, 1)).toBe("3B");
  });
});

describe("buildUnitNames", () => {
  it("generates the requested count", () => {
    expect(buildUnitNames(3, 3)).toEqual(["3A", "3B", "3C"]);
    expect(buildUnitNames(0, 2)).toEqual(["GA", "GB"]);
    expect(buildUnitNames(1, 0)).toEqual([]);
  });

  it("honours custom names and falls back for blanks", () => {
    expect(buildUnitNames(3, 3, ["PH1", "", "  "])).toEqual(["PH1", "3B", "3C"]);
  });
});

describe("assertUniqueUnitNames", () => {
  it("passes when names are unique within a block", () => {
    expect(() => assertUniqueUnitNames(["3A", "3B"])).not.toThrow();
  });

  it("is case-insensitive and throws on duplicates", () => {
    expect(() => assertUniqueUnitNames(["3A", "3a"])).toThrow(/Duplicate/);
  });
});
