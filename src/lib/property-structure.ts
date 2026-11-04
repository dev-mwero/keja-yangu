import { Types } from "mongoose";
import type { PropertyPurpose } from "@/lib/domain-enums";
import {
  MAX_UNITS_PER_PROPERTY,
  type PersistedBlock,
  type StructureBlockInput,
  type UnitInsert,
} from "@/lib/schemas/structure";
import { buildUnitNames, defaultUnitName, letterLabel } from "@/lib/unit-naming";

/**
 * Reconciles a property's persisted `blocks` structure with an edited payload,
 * emitting the exact unit documents to create/update/soft-delete.
 *
 * Matching is id-based: a block/floor that carries an existing subdocument `id`
 * is edited in place; one without an `id` is created. Existing units are never
 * rebuilt from scratch (their `_id`s are referenced by move requests and
 * invoices), so the planner computes a minimal diff instead.
 *
 * Invariants enforced (throw `StructureError` when violated):
 * - A block/floor holding an occupied unit cannot be removed.
 * - `unitsPerFloor` cannot drop below the number of occupied units on a floor.
 * - Unit names stay unique within a block.
 * - The property never exceeds `MAX_UNITS_PER_PROPERTY`.
 */

export interface ExistingUnit {
  _id: unknown;
  blockId: string;
  floorId: string;
  name: string;
  letter: string;
  status: string;
  /** Array of occupant user ids. Empty = vacant. */
  tenantId?: string[];
}

export interface NextFloor {
  _id: Types.ObjectId;
  level: number;
  label: string;
  unitsPerFloor: number;
  rentOverride: number | null;
  purpose: PropertyPurpose | null;
}

export interface NextBlock {
  _id: Types.ObjectId;
  name: string;
  order: number;
  rentOverride: number | null;
  purpose: PropertyPurpose | null;
  floors: NextFloor[];
}

export interface UnitUpdate {
  id: string;
  blockId: string;
  blockName: string;
  floorId: string;
  floorLevel: number;
  floorLabel: string;
}

export interface StructurePlanInput {
  propertyId: string;
  ownerId: string;
  existingBlocks: PersistedBlock[];
  existingUnits: ExistingUnit[];
  specs: StructureBlockInput[];
}

export interface StructurePlan {
  blocks: NextBlock[];
  unitCreates: UnitInsert[];
  unitUpdates: UnitUpdate[];
  unitDeletes: string[];
}

export class StructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StructureError";
  }
}

function isOccupied(unit: ExistingUnit): boolean {
  return unit.status === "occupied" || (unit.tenantId?.length ?? 0) > 0;
}

/** Zero-based index encoded in a unit letter: "A" -> 0, "Z" -> 25, "AA" -> 26. */
function letterIndex(letter: string): number {
  const upper = letter.trim().toUpperCase();
  if (!upper) return Number.MAX_SAFE_INTEGER;
  let value = 0;
  for (const ch of upper) {
    const code = ch.charCodeAt(0) - 64;
    if (code < 1 || code > 26) return Number.MAX_SAFE_INTEGER;
    value = value * 26 + code;
  }
  return value - 1;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export function planStructureUpdate(input: StructurePlanInput): StructurePlan {
  const { propertyId, ownerId, existingBlocks, existingUnits, specs } = input;

  const blockById = new Map(existingBlocks.map((block) => [String(block._id), block]));
  const unitsByBlock = groupBy(existingUnits, (unit) => unit.blockId);
  const unitsByFloor = groupBy(existingUnits, (unit) => unit.floorId);

  const unitCreates: UnitInsert[] = [];
  const unitUpdates: UnitUpdate[] = [];
  const unitDeletes: string[] = [];
  const deletedUnitIds = new Set<string>();

  const specBlockIds = new Set(specs.map((spec) => spec.id).filter(Boolean) as string[]);

  // 1. Whole blocks that disappeared from the payload.
  for (const block of existingBlocks) {
    const blockId = String(block._id);
    if (specBlockIds.has(blockId)) continue;
    const units = unitsByBlock.get(blockId) ?? [];
    if (units.some(isOccupied)) {
      throw new StructureError(
        `Block "${block.name}" has occupied units and cannot be removed. Reassign its tenants first.`,
      );
    }
    for (const unit of units) {
      unitDeletes.push(String(unit._id));
      deletedUnitIds.add(String(unit._id));
    }
  }

  // 2. Floors removed from a block that is being kept.
  for (const spec of specs) {
    if (!spec.id) continue;
    const block = blockById.get(spec.id);
    if (!block) continue;
    const specFloorIds = new Set(spec.floors.map((floor) => floor.id).filter(Boolean) as string[]);
    for (const floor of block.floors) {
      const floorId = String(floor._id);
      if (specFloorIds.has(floorId)) continue;
      const units = (unitsByFloor.get(floorId) ?? []).filter(
        (unit) => !deletedUnitIds.has(String(unit._id)),
      );
      if (units.some(isOccupied)) {
        throw new StructureError(
          `Floor ${floor.level} in block "${block.name}" has occupied units and cannot be removed.`,
        );
      }
      for (const unit of units) {
        unitDeletes.push(String(unit._id));
        deletedUnitIds.add(String(unit._id));
      }
    }
  }

  // 3. Build the next structure and the matching unit mutations.
  const blocks: NextBlock[] = specs.map((spec, order) => {
    const existingBlock = spec.id ? blockById.get(spec.id) : undefined;
    const blockId = existingBlock ? String(existingBlock._id) : String(new Types.ObjectId());

    const usedNames = new Set<string>();
    for (const unit of unitsByBlock.get(blockId) ?? []) {
      if (!deletedUnitIds.has(String(unit._id))) usedNames.add(unit.name.trim().toLowerCase());
    }

    const reserveName = (candidate: string): string => {
      const key = candidate.trim().toLowerCase();
      if (usedNames.has(key)) {
        throw new StructureError(
          `Unit name "${candidate}" already exists in block "${spec.name}".`,
        );
      }
      usedNames.add(key);
      return candidate;
    };

    const floors: NextFloor[] = spec.floors.map((floorSpec) => {
      const existingFloor =
        existingBlock && floorSpec.id
          ? existingBlock.floors.find((floor) => String(floor._id) === floorSpec.id)
          : undefined;
      const floorId = existingFloor ? String(existingFloor._id) : String(new Types.ObjectId());
      const label = floorSpec.label ?? existingFloor?.label ?? "";
      const desired = floorSpec.unitsPerFloor ?? 0;

      const liveUnits = (unitsByFloor.get(floorId) ?? []).filter(
        (unit) => !deletedUnitIds.has(String(unit._id)),
      );

      const insertsFor = (names: string[], startIndex: number): UnitInsert[] =>
        names.map((name, offset) => {
          const index = startIndex + offset;
          return {
            propertyId,
            ownerId,
            blockId,
            blockName: spec.name,
            floorId,
            floorLevel: floorSpec.level,
            floorLabel: label,
            name,
            letter: letterLabel(index),
            status: "available",
            rent: null,
            tenantId: [],
          };
        });

      if (existingFloor) {
        if (desired < liveUnits.length) {
          const sorted = [...liveUnits].sort(
            (a, b) => letterIndex(a.letter) - letterIndex(b.letter),
          );
          const removable = sorted.slice(desired);
          if (removable.some(isOccupied)) {
            throw new StructureError(
              `Cannot reduce units on floor ${floorSpec.level} below its ${liveUnits.filter(isOccupied).length} occupied unit(s).`,
            );
          }
          for (const unit of removable) {
            unitDeletes.push(String(unit._id));
            deletedUnitIds.add(String(unit._id));
            usedNames.delete(unit.name.trim().toLowerCase());
          }
        }

        const surviving = (unitsByFloor.get(floorId) ?? []).filter(
          (unit) => !deletedUnitIds.has(String(unit._id)),
        );
        for (const unit of surviving) {
          unitUpdates.push({
            id: String(unit._id),
            blockId,
            blockName: spec.name,
            floorId,
            floorLevel: floorSpec.level,
            floorLabel: label,
          });
        }

        if (desired > surviving.length) {
          const names = Array.from({ length: desired - surviving.length }, (_, i) => {
            const index = surviving.length + i;
            return reserveName(
              floorSpec.unitNames?.[index]?.trim() || defaultUnitName(floorSpec.level, index),
            );
          });
          unitCreates.push(...insertsFor(names, surviving.length));
        }

        return {
          _id: new Types.ObjectId(floorId),
          level: floorSpec.level,
          label,
          unitsPerFloor: desired,
          rentOverride: floorSpec.rentOverride ?? null,
          purpose: floorSpec.purpose ?? null,
        };
      }

      // Brand-new floor.
      const names = buildUnitNames(floorSpec.level, desired, floorSpec.unitNames).map((name) =>
        reserveName(name),
      );
      unitCreates.push(...insertsFor(names, 0));

      return {
        _id: new Types.ObjectId(floorId),
        level: floorSpec.level,
        label,
        unitsPerFloor: desired,
        rentOverride: floorSpec.rentOverride ?? null,
        purpose: floorSpec.purpose ?? null,
      };
    });

    return {
      _id: new Types.ObjectId(blockId),
      name: spec.name,
      order,
      rentOverride: spec.rentOverride ?? null,
      purpose: spec.purpose ?? null,
      floors,
    };
  });

  const totalUnits = existingUnits.length - unitDeletes.length + unitCreates.length;
  if (totalUnits > MAX_UNITS_PER_PROPERTY) {
    throw new StructureError(
      `A property may have at most ${MAX_UNITS_PER_PROPERTY} units (this change would create ${totalUnits}).`,
    );
  }

  return { blocks, unitCreates, unitUpdates, unitDeletes };
}
