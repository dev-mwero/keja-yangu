export interface EmbeddedBlock {
  _id: unknown;
  name?: string;
  order?: number;
  rentOverride?: number | null;
  purpose?: string | null;
}

export interface PropertyDoc {
  _id: unknown;
  title?: string;
  blocks?: EmbeddedBlock[];
  deletedAt?: Date | null;
}

export interface UnitDoc {
  _id: unknown;
  propertyId?: string;
  blockId?: string;
  name?: string;
}

export interface BackfillBlockPlan {
  propertyId: string;
  name: string;
  order: number;
  rentOverride: number | null;
  purpose: string | null;
  legacyEmbeddedId: string;
}

export interface ValidationMismatch {
  unitId: string;
  unitName: string;
  propertyId: string;
  blockId: string;
  issue: string;
}

export function planBlockBackfill(
  properties: PropertyDoc[],
  units: UnitDoc[],
): {
  blocks: BackfillBlockPlan[];
  mismatches: ValidationMismatch[];
} {
  const blocks: BackfillBlockPlan[] = [];
  const propertyBlockIdMap = new Map<string, Set<string>>();

  for (const property of properties) {
    const propId = String(property._id);
    const validBlockIds = new Set<string>();
    propertyBlockIdMap.set(propId, validBlockIds);

    const propBlocks = property.blocks ?? [];
    for (const [idx, block] of propBlocks.entries()) {
      const embeddedId = String(block._id);
      validBlockIds.add(embeddedId);
      blocks.push({
        propertyId: propId,
        name: block.name?.trim() || `Block ${idx + 1}`,
        order: typeof block.order === "number" ? block.order : idx,
        rentOverride: block.rentOverride ?? null,
        purpose: block.purpose ?? null,
        legacyEmbeddedId: embeddedId,
      });
    }
  }

  const mismatches: ValidationMismatch[] = [];
  for (const unit of units) {
    const propId = String(unit.propertyId ?? "");
    const blockId = String(unit.blockId ?? "");
    const validBlocks = propertyBlockIdMap.get(propId);

    if (!validBlocks) {
      mismatches.push({
        unitId: String(unit._id),
        unitName: String(unit.name ?? ""),
        propertyId: propId,
        blockId,
        issue: "Unit references a property that does not exist or is deleted",
      });
    } else if (!validBlocks.has(blockId)) {
      mismatches.push({
        unitId: String(unit._id),
        unitName: String(unit.name ?? ""),
        propertyId: propId,
        blockId,
        issue: `Unit blockId ${blockId} does not match any embedded block in property ${propId}`,
      });
    }
  }

  return { blocks, mismatches };
}
