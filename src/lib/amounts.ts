/**
 * Amount rollups shared by the `/api/v1/amounts` route and its tests.
 *
 * Expected rent follows the unit → floor → block hierarchy documented on
 * `Unit.rent` ("falls back to floor/block/property rent"): a unit's own rent
 * wins, otherwise the containing floor's `rentOverride`, otherwise the
 * containing block's `rentOverride`. A unit with no resolvable rent
 * contributes nothing — units are materialised with `rent: null`
 * (`buildUnitInserts`), so reading `unit.rent` alone would silently total 0.
 */

interface RentOverride {
  rentOverride?: number | null;
}

export interface RentSourceFloor extends RentOverride {
  _id?: unknown;
}

export interface RentSourceBlock extends RentOverride {
  _id: unknown;
  floors?: RentSourceFloor[];
}

export interface RentSourceProperty {
  blocks?: RentSourceBlock[];
}

export interface RentSourceUnit {
  rent?: number | null;
  floorId?: string;
  blockId?: string;
}

/** Indexes floor and block subdocument ids to their rent overrides. */
export function buildRentLookup(properties: RentSourceProperty[]): {
  floors: Map<string, number>;
  blocks: Map<string, number>;
} {
  const floors = new Map<string, number>();
  const blocks = new Map<string, number>();

  for (const property of properties) {
    for (const block of property.blocks ?? []) {
      if (block._id != null && block.rentOverride != null) {
        blocks.set(String(block._id), block.rentOverride);
      }
      for (const floor of block.floors ?? []) {
        if (floor._id != null && floor.rentOverride != null) {
          floors.set(String(floor._id), floor.rentOverride);
        }
      }
    }
  }

  return { floors, blocks };
}

/** Resolves one unit's monthly rent through the floor/block fallback chain. */
export function resolveUnitRent(
  unit: RentSourceUnit,
  lookup: { floors: Map<string, number>; blocks: Map<string, number> },
): number {
  if (unit.rent != null) return unit.rent;

  const floorRent = unit.floorId != null ? lookup.floors.get(String(unit.floorId)) : undefined;
  if (floorRent != null) return floorRent;

  const blockRent = unit.blockId != null ? lookup.blocks.get(String(unit.blockId)) : undefined;
  return blockRent ?? 0;
}

/** Sum of resolved rents across every unit — the "expected" amount. */
export function sumExpectedRent(units: RentSourceUnit[], properties: RentSourceProperty[]): number {
  const lookup = buildRentLookup(properties);
  return units.reduce((sum, unit) => sum + resolveUnitRent(unit, lookup), 0);
}
