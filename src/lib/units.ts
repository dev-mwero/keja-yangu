import type { BlockInput, PersistedBlock, UnitInsert } from "@/lib/schemas/structure";
import { MAX_UNITS_PER_PROPERTY } from "@/lib/schemas/structure";
import { assertUniqueUnitNames, buildUnitNames, letterLabel } from "@/lib/unit-naming";

/**
 * Build the `Unit` documents for a newly created property. `persisted` is the
 * property's saved `blocks` array (subdoc ids), `specs` is the validated create
 * payload; they are zipped by index.
 */
export function buildUnitInserts(
  propertyId: string,
  ownerId: string,
  persisted: PersistedBlock[],
  specs: BlockInput[],
): UnitInsert[] {
  const inserts: UnitInsert[] = [];

  persisted.forEach((block, blockIndex) => {
    const spec = specs[blockIndex];
    if (!spec) return;

    block.floors.forEach((floor, floorIndex) => {
      const floorSpec = spec.floors[floorIndex];
      const count = floorSpec?.unitsPerFloor ?? floor.unitsPerFloor ?? 0;
      const names = buildUnitNames(floor.level, count, floorSpec?.unitNames);
      assertUniqueUnitNames(names);

      names.forEach((name, unitIndex) => {
        inserts.push({
          propertyId,
          ownerId,
          blockId: String(block._id),
          blockName: block.name,
          floorId: String(floor._id),
          floorLevel: floor.level,
          floorLabel: floor.label ?? "",
          name,
          letter: letterLabel(unitIndex),
          status: "available",
          rent: null,
          tenantId: [],
        });
      });
    });
  });

  if (inserts.length > MAX_UNITS_PER_PROPERTY) {
    throw new Error(`A property may have at most ${MAX_UNITS_PER_PROPERTY} units`);
  }
  return inserts;
}

/** Total units the create payload would generate (used for pre-insert validation). */
export function countRequestedUnits(specs: BlockInput[]): number {
  return specs.reduce(
    (total, block) =>
      total + block.floors.reduce((sum, floor) => sum + (floor.unitsPerFloor ?? 0), 0),
    0,
  );
}
