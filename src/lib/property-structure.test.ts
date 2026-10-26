import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import {
  type ExistingUnit,
  planStructureUpdate,
  StructureError,
  type StructurePlanInput,
} from "@/lib/property-structure";
import { MAX_UNITS_PER_PROPERTY } from "@/lib/schemas/structure";

const PROPERTY_ID = "64f000000000000000000001";
const OWNER_ID = "64f000000000000000000002";

function block(name: string, floors: { level: number; unitsPerFloor: number; label?: string }[]) {
  const blockId = new Types.ObjectId();
  return {
    _id: blockId,
    name,
    rentOverride: null,
    floors: floors.map((floor) => ({
      _id: new Types.ObjectId(),
      level: floor.level,
      label: floor.label ?? "",
      unitsPerFloor: floor.unitsPerFloor,
      rentOverride: null,
    })),
  };
}

function unitsFor(
  blockDoc: ReturnType<typeof block>,
  opts: { occupied?: number[] } = {},
): ExistingUnit[] {
  const occupied = new Set(opts.occupied ?? []);
  const units: ExistingUnit[] = [];
  blockDoc.floors.forEach((floor) => {
    for (let i = 0; i < floor.unitsPerFloor; i++) {
      const letter = String.fromCharCode(65 + i);
      const prefix = floor.level <= 0 ? "G" : String(floor.level);
      const isOccupied = occupied.has(i);
      units.push({
        _id: new Types.ObjectId(),
        blockId: String(blockDoc._id),
        floorId: String(floor._id),
        name: `${prefix}${letter}`,
        letter,
        status: isOccupied ? "occupied" : "available",
        tenantId: isOccupied ? ["tenant-1"] : [],
      });
    }
  });
  return units;
}

function baseInput(overrides: Partial<StructurePlanInput>): StructurePlanInput {
  return {
    propertyId: PROPERTY_ID,
    ownerId: OWNER_ID,
    existingBlocks: [],
    existingUnits: [],
    specs: [],
    ...overrides,
  };
}

describe("planStructureUpdate", () => {
  it("creates units for a brand-new block", () => {
    const plan = planStructureUpdate(
      baseInput({ specs: [{ name: "A", floors: [{ level: 0, unitsPerFloor: 3 }] }] }),
    );

    expect(plan.blocks).toHaveLength(1);
    expect(plan.blocks[0].name).toBe("A");
    expect(plan.unitCreates.map((unit) => unit.name)).toEqual(["GA", "GB", "GC"]);
    expect(plan.unitDeletes).toEqual([]);
    expect(plan.unitUpdates).toEqual([]);
    expect(plan.unitCreates[0]).toMatchObject({ propertyId: PROPERTY_ID, ownerId: OWNER_ID });
  });

  it("removes a vacant block and its units", () => {
    const a = block("A", [{ level: 0, unitsPerFloor: 2 }]);
    const units = unitsFor(a);

    const plan = planStructureUpdate(
      baseInput({ existingBlocks: [a], existingUnits: units, specs: [] }),
    );

    expect(plan.blocks).toEqual([]);
    expect(plan.unitDeletes.sort()).toEqual(units.map((u) => String(u._id)).sort());
    expect(plan.unitCreates).toEqual([]);
  });

  it("refuses to remove a block that holds an occupied unit", () => {
    const a = block("A", [{ level: 0, unitsPerFloor: 2 }]);
    const units = unitsFor(a, { occupied: [0] });

    expect(() =>
      planStructureUpdate(baseInput({ existingBlocks: [a], existingUnits: units, specs: [] })),
    ).toThrow(StructureError);
  });

  it("preserves existing unit ids while renaming a block", () => {
    const a = block("A", [{ level: 0, unitsPerFloor: 2 }]);
    const units = unitsFor(a);

    const plan = planStructureUpdate(
      baseInput({
        existingBlocks: [a],
        existingUnits: units,
        specs: [
          {
            id: String(a._id),
            name: "Block A",
            floors: [{ id: String(a.floors[0]._id), level: 0, unitsPerFloor: 2 }],
          },
        ],
      }),
    );

    expect(plan.unitCreates).toEqual([]);
    expect(plan.unitDeletes).toEqual([]);
    expect(plan.unitUpdates).toHaveLength(2);
    expect(plan.unitUpdates.every((u) => u.blockName === "Block A")).toBe(true);
    expect(plan.unitUpdates.map((u) => u.id).sort()).toEqual(
      units.map((u) => String(u._id)).sort(),
    );
  });

  it("adds units when unitsPerFloor increases", () => {
    const a = block("A", [{ level: 3, unitsPerFloor: 2 }]);
    const units = unitsFor(a);

    const plan = planStructureUpdate(
      baseInput({
        existingBlocks: [a],
        existingUnits: units,
        specs: [
          {
            id: String(a._id),
            name: "A",
            floors: [{ id: String(a.floors[0]._id), level: 3, unitsPerFloor: 4 }],
          },
        ],
      }),
    );

    expect(plan.unitDeletes).toEqual([]);
    expect(plan.unitCreates.map((u) => u.name)).toEqual(["3C", "3D"]);
  });

  it("removes the highest vacant units when unitsPerFloor decreases", () => {
    const a = block("A", [{ level: 3, unitsPerFloor: 4 }]);
    const units = unitsFor(a);
    const removeIds = units
      .filter((u) => u.letter === "C" || u.letter === "D")
      .map((u) => String(u._id));

    const plan = planStructureUpdate(
      baseInput({
        existingBlocks: [a],
        existingUnits: units,
        specs: [
          {
            id: String(a._id),
            name: "A",
            floors: [{ id: String(a.floors[0]._id), level: 3, unitsPerFloor: 2 }],
          },
        ],
      }),
    );

    expect(plan.unitDeletes.sort()).toEqual(removeIds.sort());
    expect(plan.unitCreates).toEqual([]);
  });

  it("refuses to shrink a floor below its occupied units", () => {
    const a = block("A", [{ level: 3, unitsPerFloor: 4 }]);
    const units = unitsFor(a, { occupied: [2] });

    expect(() =>
      planStructureUpdate(
        baseInput({
          existingBlocks: [a],
          existingUnits: units,
          specs: [
            {
              id: String(a._id),
              name: "A",
              floors: [{ id: String(a.floors[0]._id), level: 3, unitsPerFloor: 1 }],
            },
          ],
        }),
      ),
    ).toThrow(StructureError);
  });

  it("adds a new floor to an existing block without touching the existing floor", () => {
    const a = block("A", [{ level: 0, unitsPerFloor: 1 }]);
    const units = unitsFor(a);

    const plan = planStructureUpdate(
      baseInput({
        existingBlocks: [a],
        existingUnits: units,
        specs: [
          {
            id: String(a._id),
            name: "A",
            floors: [
              { id: String(a.floors[0]._id), level: 0, unitsPerFloor: 1 },
              { level: 1, unitsPerFloor: 2 },
            ],
          },
        ],
      }),
    );

    expect(plan.unitDeletes).toEqual([]);
    expect(plan.unitCreates.map((u) => u.name)).toEqual(["1A", "1B"]);
    expect(plan.blocks[0].floors).toHaveLength(2);
  });

  it("removes a vacant floor from a kept block", () => {
    const a = block("A", [
      { level: 0, unitsPerFloor: 1 },
      { level: 1, unitsPerFloor: 1 },
    ]);
    const units = unitsFor(a);
    const firstFloorId = String(a.floors[0]._id);
    const removed = units.filter((u) => u.floorId === String(a.floors[1]._id));

    const plan = planStructureUpdate(
      baseInput({
        existingBlocks: [a],
        existingUnits: units,
        specs: [
          {
            id: String(a._id),
            name: "A",
            floors: [{ id: firstFloorId, level: 0, unitsPerFloor: 1 }],
          },
        ],
      }),
    );

    expect(plan.unitDeletes.sort()).toEqual(removed.map((u) => String(u._id)).sort());
    expect(plan.blocks[0].floors).toHaveLength(1);
  });

  it("rejects duplicate unit names within a block", () => {
    const a = block("A", [{ level: 0, unitsPerFloor: 2 }]);
    const units = unitsFor(a);

    expect(() =>
      planStructureUpdate(
        baseInput({
          existingBlocks: [a],
          existingUnits: units,
          specs: [
            {
              id: String(a._id),
              name: "A",
              floors: [
                { id: String(a.floors[0]._id), level: 0, unitsPerFloor: 2 },
                { level: 0, unitsPerFloor: 2 },
              ],
            },
          ],
        }),
      ),
    ).toThrow(StructureError);
  });

  it("enforces the per-property unit cap", () => {
    expect(() =>
      planStructureUpdate(
        baseInput({
          specs: [{ name: "A", floors: [{ level: 0, unitsPerFloor: MAX_UNITS_PER_PROPERTY + 1 }] }],
        }),
      ),
    ).toThrow(StructureError);
  });
});
