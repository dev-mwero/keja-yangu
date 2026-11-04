import { z } from "zod";
import {
  DEFAULT_PROPERTY_PURPOSE,
  PROPERTY_PURPOSES,
  type PropertyPurpose,
} from "@/lib/domain-enums";

export const floorInput = z.object({
  level: z.coerce.number().int().min(-5).max(200),
  label: z.string().trim().max(60).optional(),
  rentOverride: z.coerce.number().nonnegative().nullable().optional(),
  purpose: z.enum(PROPERTY_PURPOSES).nullable().optional(),
  unitsPerFloor: z.coerce.number().int().min(0).max(200).default(0),
  // Optional custom unit names for this floor (overrides generated GA/GB/3A).
  unitNames: z.array(z.string().trim().min(1).max(24)).optional(),
});

export const blockInput = z.object({
  name: z.string().trim().min(1).max(80),
  rentOverride: z.coerce.number().nonnegative().nullable().optional(),
  purpose: z.enum(PROPERTY_PURPOSES).nullable().optional(),
  floors: z.array(floorInput).min(1).max(200),
});

export const propertyBlocksInput = z.array(blockInput).max(50);

/**
 * Structure-update payload. Identical in shape to the create payload, except
 * each block/floor may carry the `id` of an existing subdocument. The server
 * matches by id to reconcile units (add / rename / remove) instead of treating
 * an edit as a full replace — which would orphan units referenced by move
 * requests and invoices.
 */
export const structureFloorInput = floorInput.extend({
  id: z.string().trim().min(1).optional(),
});

export const structureBlockInput = blockInput.extend({
  id: z.string().trim().min(1).optional(),
  floors: z.array(structureFloorInput).min(1).max(200),
});

export const structureUpdateInput = z.object({
  blocks: z.array(structureBlockInput).max(50),
});

export type FloorInput = z.infer<typeof floorInput>;
export type BlockInput = z.infer<typeof blockInput>;
export type StructureFloorInput = z.infer<typeof structureFloorInput>;
export type StructureBlockInput = z.infer<typeof structureBlockInput>;

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
  purpose?: PropertyPurpose | null;
}

export interface PersistedBlock {
  _id: unknown;
  name: string;
  rentOverride?: number | null;
  purpose?: PropertyPurpose | null;
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
  purpose?: PropertyPurpose | null;
  /** Array of occupant user ids. Empty = vacant. */
  tenantId: string[];
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

/**
 * Effective purpose for a unit, resolving the override chain
 * unit -> floor -> block -> property.
 */
export function effectivePurpose(
  unitPurpose?: PropertyPurpose | null,
  floorPurpose?: PropertyPurpose | null,
  blockPurpose?: PropertyPurpose | null,
  propertyPurpose?: PropertyPurpose | null,
): PropertyPurpose {
  return unitPurpose ?? floorPurpose ?? blockPurpose ?? propertyPurpose ?? DEFAULT_PROPERTY_PURPOSE;
}
