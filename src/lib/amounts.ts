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
  _id?: unknown;
  price?: number;
  blocks?: RentSourceBlock[];
}

export interface RentSourceUnit {
  rent?: number | null;
  status?: string;
  floorId?: string;
  blockId?: string;
  propertyId?: string;
}

export interface ContractedRentSource {
  rentAmount: number;
  startDate: Date | string;
  endDate?: Date | string | null;
}

/** Indexes floor and block subdocument ids to their rent overrides. */
export function buildRentLookup(properties: RentSourceProperty[]): {
  floors: Map<string, number>;
  blocks: Map<string, number>;
  properties: Map<string, number>;
} {
  const floors = new Map<string, number>();
  const blocks = new Map<string, number>();
  const propertyRents = new Map<string, number>();

  for (const property of properties) {
    if (property._id != null && property.price != null) {
      propertyRents.set(String(property._id), property.price);
    }
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

  return { floors, blocks, properties: propertyRents };
}

/** Resolves one unit's monthly rent through the floor/block fallback chain. */
export function resolveUnitRent(
  unit: RentSourceUnit,
  lookup: {
    floors: Map<string, number>;
    blocks: Map<string, number>;
    properties?: Map<string, number>;
  },
): number {
  if (unit.rent != null) return unit.rent;

  const floorRent = unit.floorId != null ? lookup.floors.get(String(unit.floorId)) : undefined;
  if (floorRent != null) return floorRent;

  const blockRent = unit.blockId != null ? lookup.blocks.get(String(unit.blockId)) : undefined;
  if (blockRent != null) return blockRent;

  const propertyRent =
    unit.propertyId != null ? lookup.properties?.get(String(unit.propertyId)) : undefined;
  return propertyRent ?? 0;
}

/** Rent potential when every rentable (available or occupied) unit is let. */
export function sumPotentialMonthlyRent(
  units: RentSourceUnit[],
  properties: RentSourceProperty[],
): number {
  const lookup = buildRentLookup(properties);
  return units.reduce(
    (sum, unit) =>
      sum +
      (unit.status === "maintenance" || unit.status == null ? 0 : resolveUnitRent(unit, lookup)),
    0,
  );
}

/** Configured monthly rent for units currently marked occupied. */
export function sumOccupiedMonthlyRent(
  units: RentSourceUnit[],
  properties: RentSourceProperty[],
): number {
  const lookup = buildRentLookup(properties);
  return units.reduce(
    (sum, unit) => sum + (unit.status === "occupied" ? resolveUnitRent(unit, lookup) : 0),
    0,
  );
}

/** Contracted rent for leases overlapping the period, prorated by calendar day. */
export function sumContractedRentForPeriod(leases: ContractedRentSource[], period: string): number {
  const [year, month] = period.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthStart = Date.UTC(year, month - 1, 1);
  const monthEnd = Date.UTC(year, month - 1, daysInMonth);
  const dayMs = 24 * 60 * 60 * 1000;

  const total = leases.reduce((sum, lease) => {
    const leaseStart = new Date(lease.startDate);
    const leaseEnd = lease.endDate ? new Date(lease.endDate) : undefined;
    const activeStart = Math.max(
      monthStart,
      Date.UTC(leaseStart.getUTCFullYear(), leaseStart.getUTCMonth(), leaseStart.getUTCDate()),
    );
    const activeEnd = Math.min(
      monthEnd,
      leaseEnd
        ? Date.UTC(leaseEnd.getUTCFullYear(), leaseEnd.getUTCMonth(), leaseEnd.getUTCDate())
        : monthEnd,
    );

    if (activeEnd < activeStart) return sum;
    const activeDays = Math.floor((activeEnd - activeStart) / dayMs) + 1;
    return sum + (lease.rentAmount * activeDays) / daysInMonth;
  }, 0);

  return Math.round(total);
}
