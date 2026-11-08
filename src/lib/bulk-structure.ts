import { MAX_UNITS_PER_PROPERTY } from "@/lib/schemas/structure";
import type { BlockInputPayload, FloorInputPayload } from "@/hooks/use-properties";
import {
  buildDuplexUnitNames,
  buildUnitNames,
} from "@/lib/unit-naming";

export interface BulkFloorSpec {
  floorCount: number;
  unitsPerFloor: number;
  includeGroundFloor: boolean;
  startLevel?: number;
  floorRentOverride?: number | null;
  customUnitNames?: string[];
  duplex?: boolean | null;
}

export interface BulkBlockSpec {
  name: string;
  duplex: boolean;
  floors: BulkFloorSpec;
  rentOverride?: number | null;
}

export interface BulkGenerationInput {
  blocks: BulkBlockSpec[];
  existingUnitCount?: number;
  mode?: "replace" | "append";
}

export class BulkStructureError extends Error {
  name = "BulkStructureError";
}

export function validateBulkGeneration(input: BulkGenerationInput): string[] {
  const errors: string[] = [];
  const seenNames = new Set<string>();

  for (const block of input.blocks) {
    const name = block.name.trim();
    if (!name) {
      errors.push("Every block needs a name.");
    } else {
      const key = name.toLowerCase();
      if (seenNames.has(key)) errors.push(`Duplicate block name: ${name}`);
      seenNames.add(key);
    }

    const spec = block.floors;
    if (spec.floorCount < 0 || !Number.isInteger(spec.floorCount)) {
      errors.push("Floor count must be a non-negative integer.");
    }
    if (spec.unitsPerFloor < 0 || !Number.isInteger(spec.unitsPerFloor)) {
      errors.push("Units per floor must be a non-negative integer.");
    }
    if (spec.floorCount > 200) {
      errors.push("A block may have at most 200 floors.");
    }
    if (spec.unitsPerFloor > 200) {
      errors.push("A floor may have at most 200 units.");
    }
  }

  // Cap check against existing + generated units
  const generatedUnits = input.blocks.reduce((total, block) => {
    const spec = block.floors;
    const floors = spec.includeGroundFloor ? spec.floorCount : spec.floorCount;
    return total + floors * spec.unitsPerFloor;
  }, 0);
  const existing = input.existingUnitCount ?? 0;
  if (existing + generatedUnits > MAX_UNITS_PER_PROPERTY) {
    errors.push(
      `A property may have at most ${MAX_UNITS_PER_PROPERTY} units (this change would create ${existing + generatedUnits}).`,
    );
  }

  return errors;
}

export function generateBulkFloors(spec: BulkFloorSpec): FloorInputPayload[] {
  if (spec.floorCount < 0 || !Number.isInteger(spec.floorCount)) {
    throw new BulkStructureError("Floor count must be a non-negative integer.");
  }
  if (spec.unitsPerFloor < 0 || !Number.isInteger(spec.unitsPerFloor)) {
    throw new BulkStructureError("Units per floor must be a non-negative integer.");
  }
  if (spec.floorCount > 200) {
    throw new BulkStructureError("A block may have at most 200 floors.");
  }
  if (spec.unitsPerFloor > 200) {
    throw new BulkStructureError("A floor may have at most 200 units.");
  }

  const floors: FloorInputPayload[] = [];
  const startLevel = spec.startLevel ?? 1;

  if (spec.floorCount <= 0) return [];

  const upperFloorCount = spec.floorCount - (spec.includeGroundFloor ? 1 : 0);

  if (spec.includeGroundFloor) {
    // Ground floor: duplex only if there's at least one upper floor to span into.
    const hasUpperFloor = upperFloorCount > 0;
    const isGroundDuplex = spec.duplex === true && hasUpperFloor;
    const groundNames = isGroundDuplex
      ? buildDuplexUnitNames(0, startLevel, spec.unitsPerFloor, spec.customUnitNames)
      : buildUnitNames(0, spec.unitsPerFloor, spec.customUnitNames);
    floors.push({
      level: 0,
      label: "",
      unitsPerFloor: spec.unitsPerFloor,
      unitNames: groundNames,
      rentOverride: spec.floorRentOverride ?? null,
      purpose: null,
      duplex: isGroundDuplex ? true : spec.duplex === true ? false : (spec.duplex ?? null),
    });
  }

  for (let i = 0; i < upperFloorCount; i++) {
    const level = startLevel + i;
    // A floor can only be duplex if there's a floor above to span into.
    const isLastFloor = i === upperFloorCount - 1;
    const canBeDuplex = !isLastFloor;
    const isDuplex = spec.duplex === true && canBeDuplex;

    const nextLevel = level + 1;
    const names = isDuplex
      ? buildDuplexUnitNames(level, nextLevel, spec.unitsPerFloor, spec.customUnitNames)
      : buildUnitNames(level, spec.unitsPerFloor, spec.customUnitNames);
    floors.push({
      level,
      label: "",
      unitsPerFloor: spec.unitsPerFloor,
      unitNames: names,
      rentOverride: spec.floorRentOverride ?? null,
      purpose: null,
      duplex: isDuplex ? true : spec.duplex === true ? false : (spec.duplex ?? null),
    });
  }

  return floors;
}

export function generateBulkBlock(spec: BulkBlockSpec): BlockInputPayload {
  const floors = generateBulkFloors(spec.floors);
  return {
    name: spec.name.trim() || "Block A",
    rentOverride: spec.rentOverride ?? null,
    purpose: null,
    duplex: spec.duplex,
    floors,
  };
}

export function generateBulkStructure(input: BulkGenerationInput): BlockInputPayload[] {
  const errors = validateBulkGeneration(input);
  if (errors.length > 0) {
    throw new BulkStructureError(errors.join(" "));
  }

  return input.blocks.map((block) => generateBulkBlock(block));
}