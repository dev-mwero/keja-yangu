import { describe, expect, it } from "vitest";
import { buildRentLookup, resolveUnitRent, sumExpectedRent } from "@/lib/amounts";

const BLOCK_ID = "block-1";
const OTHER_BLOCK_ID = "block-2";
const FLOOR_ID = "floor-1";
const OTHER_FLOOR_ID = "floor-2";

function property(
  overrides: {
    blockRent?: number | null;
    floorRent?: number | null;
    blockId?: string;
    floorId?: string;
  } = {},
) {
  const blockId = overrides.blockId ?? BLOCK_ID;
  const floorId = overrides.floorId ?? FLOOR_ID;
  return {
    blocks: [
      {
        _id: blockId,
        name: "A",
        rentOverride: overrides.blockRent ?? null,
        floors: [
          {
            _id: floorId,
            level: 1,
            label: "1",
            unitsPerFloor: 1,
            rentOverride: overrides.floorRent ?? null,
          },
        ],
      },
    ],
  };
}

describe("resolveUnitRent", () => {
  it("prefers the unit's own rent over every override", () => {
    const lookup = buildRentLookup([property({ blockRent: 20000, floorRent: 25000 })]);
    expect(resolveUnitRent({ rent: 30000, floorId: FLOOR_ID, blockId: BLOCK_ID }, lookup)).toBe(
      30000,
    );
  });

  it("falls back to the floor override when the unit has no rent", () => {
    const lookup = buildRentLookup([property({ blockRent: 20000, floorRent: 25000 })]);
    expect(resolveUnitRent({ rent: null, floorId: FLOOR_ID, blockId: BLOCK_ID }, lookup)).toBe(
      25000,
    );
  });

  it("falls back to the block override when the floor has none", () => {
    const lookup = buildRentLookup([property({ blockRent: 20000, floorRent: null })]);
    expect(resolveUnitRent({ rent: null, floorId: FLOOR_ID, blockId: BLOCK_ID }, lookup)).toBe(
      20000,
    );
  });

  it("resolves to 0 when no level carries a rent", () => {
    const lookup = buildRentLookup([property({ blockRent: null, floorRent: null })]);
    expect(resolveUnitRent({ rent: null, floorId: FLOOR_ID, blockId: BLOCK_ID }, lookup)).toBe(0);
  });

  it("resolves to 0 when the unit references unknown floor and block ids", () => {
    const lookup = buildRentLookup([property({ blockRent: 20000, floorRent: 25000 })]);
    expect(resolveUnitRent({ rent: null, floorId: "nope", blockId: "nada" }, lookup)).toBe(0);
  });

  it("does not leak an override across blocks or floors", () => {
    const lookup = buildRentLookup([
      property({ blockRent: 20000, floorRent: 25000 }),
      property({
        blockRent: 9000,
        floorRent: null,
        blockId: OTHER_BLOCK_ID,
        floorId: OTHER_FLOOR_ID,
      }),
    ]);
    expect(
      resolveUnitRent({ rent: null, floorId: OTHER_FLOOR_ID, blockId: OTHER_BLOCK_ID }, lookup),
    ).toBe(9000);
  });
});

describe("sumExpectedRent", () => {
  it("sums the resolved rent of every unit", () => {
    const props = [property({ blockRent: 20000, floorRent: 25000 })];
    const units = [
      { rent: 30000, floorId: FLOOR_ID, blockId: BLOCK_ID },
      { rent: null, floorId: FLOOR_ID, blockId: BLOCK_ID },
      { rent: null, floorId: OTHER_FLOOR_ID, blockId: OTHER_BLOCK_ID },
    ];
    expect(sumExpectedRent(units, props)).toBe(55000);
  });

  it("returns 0 for an empty portfolio", () => {
    expect(sumExpectedRent([], [])).toBe(0);
  });

  it("tolerates properties without a blocks array", () => {
    expect(sumExpectedRent([{ rent: 12000, floorId: FLOOR_ID, blockId: BLOCK_ID }], [{}])).toBe(
      12000,
    );
  });
});
