import { z } from "zod";

export const floorInput = z.object({
  level: z.coerce.number().int().min(-5).max(200),
  label: z.string().trim().max(60).optional(),
  rentOverride: z.coerce.number().nonnegative().nullable().optional(),
  unitsPerFloor: z.coerce.number().int().min(0).max(200).default(0),
  // Optional custom unit names for this floor (overrides generated GA/GB/3A).
  unitNames: z.array(z.string().trim().min(1).max(24)).optional(),
});

export const blockInput = z.object({
  name: z.string().trim().min(1).max(80),
  rentOverride: z.coerce.number().nonnegative().nullable().optional(),
  floors: z.array(floorInput).min(1).max(200),
});

export const propertyBlocksInput = z.array(blockInput).max(50);

export type FloorInput = z.infer<typeof floorInput>;
export type BlockInput = z.infer<typeof blockInput>;

/**
 * Flatten a persisted property's blocks + the create specs into the unit
 * documents that should be inserted. Blocks/floors are zipped by index (the
 * persisted subdocuments preserve input order and carry the generated ids).
 */
export interface PersistedFloor {
  _id: unknown;
  level: number;
  label?: string;
  unitsPerFloor?: number;
  rentOverride?: number | null;
}

export interface PersistedBlock {
  _id: unknown;
  name: string;
  rentOverride?: number | null;
  floors: PersistedFloor[];
}

export interface UnitInsert {
  propertyId: string;
  ownerId: string;
  blockId: string;
  blockName: string;
  floorId: string;
  floorLevel: number;
  floorLabel: string;
  name: string;
  letter: string;
  status: "available";
  rent: number | null;
  tenantId: string;
}

export const MAX_UNITS_PER_PROPERTY = 2000;

/**
 * Effective monthly rent for a unit, resolving the override chain
 * unit -> floor -> block -> property.
 */
export function effectiveRent(
  unitRent: number | null | undefined,
  floorRentOverride: number | null | undefined,
  blockRentOverride: number | null | undefined,
  propertyRent: number,
): number {
  return unitRent ?? floorRentOverride ?? blockRentOverride ?? propertyRent ?? 0;
}
