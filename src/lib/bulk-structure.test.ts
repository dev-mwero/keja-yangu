/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import {
  BulkStructureError,
  generateBulkBlock,
  generateBulkFloors,
  generateBulkStructure,
  validateBulkGeneration,
} from "@/lib/bulk-structure";
import { MAX_UNITS_PER_PROPERTY } from "@/lib/schemas/structure";

describe("validateBulkGeneration", () => {
  it("returns no errors for a valid single block", () => {
    expect(
      validateBulkGeneration({
        blocks: [
          {
            name: "Block A",
            duplex: false,
            floors: { floorCount: 2, unitsPerFloor: 3, includeGroundFloor: true },
          },
        ],
      }),
    ).toEqual([]);
  });

  it("rejects an empty block name", () => {
    const errors = validateBulkGeneration({
      blocks: [
        {
          name: "   ",
          duplex: false,
          floors: { floorCount: 1, unitsPerFloor: 1, includeGroundFloor: true },
        },
      ],
    });
    expect(errors).toContain("Every block needs a name.");
  });

  it("detects duplicate block names across blocks (case-insensitive)", () => {
    const errors = validateBulkGeneration({
      blocks: [
        {
          name: "Block A",
          duplex: false,
          floors: { floorCount: 1, unitsPerFloor: 1, includeGroundFloor: true },
        },
        {
          name: "block a",
          duplex: false,
          floors: { floorCount: 1, unitsPerFloor: 1, includeGroundFloor: true },
        },
      ],
    });
    expect(errors.join(" ")).toMatch(/duplicate block name/i);
  });

  it("rejects negative or non-integer counts", () => {
    const errors = validateBulkGeneration({
      blocks: [
        {
          name: "A",
          duplex: false,
          floors: { floorCount: -1, unitsPerFloor: 1.5, includeGroundFloor: true },
        },
      ],
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/floor count/i),
        expect.stringMatching(/units per floor/i),
      ]),
    );
  });

  it("enforces MAX_UNITS_PER_PROPERTY against existing + generated units", () => {
    const errors = validateBulkGeneration({
      existingUnitCount: MAX_UNITS_PER_PROPERTY,
      blocks: [
        {
          name: "A",
          duplex: false,
          floors: { floorCount: 1, unitsPerFloor: 1, includeGroundFloor: true },
        },
      ],
    });
    expect(errors.join(" ")).toMatch(/at most/);
  });
});

describe("generateBulkFloors", () => {
  it("numbers floors with a ground floor (level 0, then 1, 2)", () => {
    const floors = generateBulkFloors({
      floorCount: 3,
      unitsPerFloor: 2,
      includeGroundFloor: true,
    });
    expect(floors.map((f) => f.level)).toEqual([0, 1, 2]);
  });

  it("numbers floors without a ground floor (1, 2, 3)", () => {
    const floors = generateBulkFloors({
      floorCount: 3,
      unitsPerFloor: 2,
      includeGroundFloor: false,
    });
    expect(floors.map((f) => f.level)).toEqual([1, 2, 3]);
  });

  it("honours a custom start level", () => {
    const floors = generateBulkFloors({
      floorCount: 2,
      unitsPerFloor: 1,
      includeGroundFloor: false,
      startLevel: 5,
    });
    expect(floors.map((f) => f.level)).toEqual([5, 6]);
  });

  it("names units via buildUnitNames (ground floor uses G prefix)", () => {
    const floors = generateBulkFloors({
      floorCount: 2,
      unitsPerFloor: 3,
      includeGroundFloor: true,
    });
    expect(floors[0].unitNames).toEqual(["GA", "GB", "GC"]);
    expect(floors[1].unitNames).toEqual(["1A", "1B", "1C"]);
  });

  it("handles 0 floors (returns [])", () => {
    expect(
      generateBulkFloors({ floorCount: 0, unitsPerFloor: 5, includeGroundFloor: true }),
    ).toEqual([]);
  });

  it("handles 0 units per floor (floor present, no unit names)", () => {
    const floors = generateBulkFloors({
      floorCount: 1,
      unitsPerFloor: 0,
      includeGroundFloor: true,
    });
    expect(floors).toHaveLength(1);
    expect(floors[0].unitsPerFloor).toBe(0);
    expect(floors[0].unitNames).toEqual([]);
  });

  it("sets floor labels to empty (display layer applies defaults)", () => {
    const floors = generateBulkFloors({
      floorCount: 1,
      unitsPerFloor: 1,
      includeGroundFloor: true,
    });
    expect(floors[0].label).toBe("");
  });

  it("throws BulkStructureError on invalid input", () => {
    expect(() =>
      generateBulkFloors({ floorCount: -1, unitsPerFloor: 2, includeGroundFloor: true }),
    ).toThrow(BulkStructureError);
  });

  it("generates duplex unit names (floor range) when duplex is true", () => {
    const floors = generateBulkFloors({
      floorCount: 3,
      unitsPerFloor: 2,
      includeGroundFloor: false,
      duplex: true,
    });
    // First two floors can be duplex (have a floor above); last cannot
    expect(floors[0].unitNames).toEqual(["1A-2A", "1B-2B"]);
    expect(floors[1].unitNames).toEqual(["2A-3A", "2B-3B"]);
    expect(floors[2].unitNames).toEqual(["3A", "3B"]); // last floor: single
    expect(floors[0].duplex).toBe(true);
    expect(floors[2].duplex).toBe(false);
  });

  it("ground floor duplex only when there is an upper floor", () => {
    const floors = generateBulkFloors({
      floorCount: 2,
      unitsPerFloor: 2,
      includeGroundFloor: true,
      duplex: true,
    });
    expect(floors[0].duplex).toBe(true); // ground + 1 upper
    expect(floors[0].unitNames).toEqual(["GA-1A", "GB-1B"]);
    // upper floor is last → not duplex
    expect(floors[1].duplex).toBe(false);
  });

  it("ground floor cannot be duplex with only 1 floor", () => {
    const floors = generateBulkFloors({
      floorCount: 1,
      unitsPerFloor: 2,
      includeGroundFloor: true,
      duplex: true,
    });
    expect(floors[0].duplex).toBe(false);
    expect(floors[0].unitNames).toEqual(["GA", "GB"]);
  });
});

describe("generateBulkBlock", () => {
  it("inherits rent when no override is provided", () => {
    const block = generateBulkBlock({
      name: "Block A",
      duplex: false,
      floors: { floorCount: 1, unitsPerFloor: 2, includeGroundFloor: true },
    });
    expect(block.rentOverride).toBeNull();
    expect(block.floors[0].rentOverride).toBeNull();
    expect(block.duplex).toBe(false);
  });

  it("applies block- and floor-level rent overrides", () => {
    const block = generateBulkBlock({
      name: "Block A",
      duplex: true,
      rentOverride: 50000,
      floors: {
        floorCount: 2,
        unitsPerFloor: 2,
        includeGroundFloor: false,
        floorRentOverride: 60000,
      },
    });
    expect(block.rentOverride).toBe(50000);
    expect(block.floors[0].rentOverride).toBe(60000);
    expect(block.duplex).toBe(true);
  });
});

describe("generateBulkStructure", () => {
  it("generates multiple blocks with correct totals", () => {
    const blocks = generateBulkStructure({
      blocks: [
        {
          name: "Block A",
          duplex: false,
          floors: { floorCount: 2, unitsPerFloor: 2, includeGroundFloor: true },
        },
        {
          name: "Block B",
          duplex: true,
          floors: { floorCount: 1, unitsPerFloor: 3, includeGroundFloor: false },
        },
      ],
    });
    expect(blocks).toHaveLength(2);
    expect(blocks[0].floors.map((f) => f.level)).toEqual([0, 1]);
    expect(blocks[1].floors.map((f) => f.level)).toEqual([1]);
  });

  it("throws when generated units exceed MAX_UNITS_PER_PROPERTY", () => {
    expect(() =>
      generateBulkStructure({
        existingUnitCount: MAX_UNITS_PER_PROPERTY - 1,
        blocks: [
          {
            name: "A",
            duplex: false,
            floors: { floorCount: 1, unitsPerFloor: 5, includeGroundFloor: true },
          },
        ],
      }),
    ).toThrow(/at most/);
  });

  it("throws on duplicate block names across blocks", () => {
    expect(() =>
      generateBulkStructure({
        blocks: [
          {
            name: "A",
            duplex: false,
            floors: { floorCount: 1, unitsPerFloor: 1, includeGroundFloor: true },
          },
          {
            name: "A",
            duplex: false,
            floors: { floorCount: 1, unitsPerFloor: 1, includeGroundFloor: true },
          },
        ],
      }),
    ).toThrow(/duplicate block name/i);
  });
});
