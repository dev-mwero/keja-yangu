"use client";

import { DoorOpen, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BlockInputPayload, FloorInputPayload } from "@/hooks/use-properties";
import { formatKES } from "@/lib/format";
import { effectiveRent, MAX_UNITS_PER_PROPERTY } from "@/lib/schemas/structure";
import { buildUnitNames } from "@/lib/unit-naming";

export interface PropertyStructureEditorProps {
  blocks: BlockInputPayload[];
  onChange: (blocks: BlockInputPayload[]) => void;
  /** Property-level monthly rent, shown as the default when no override is set. */
  baseRent?: number;
  disabled?: boolean;
}

const emptyFloor = (): FloorInputPayload => ({
  level: 0,
  label: "",
  unitsPerFloor: 0,
  unitNames: [],
});

const emptyBlock = (index: number): BlockInputPayload => ({
  name: `Block ${String.fromCharCode(65 + index)}`,
  rentOverride: null,
  floors: [emptyFloor()],
});

export function countBlockUnits(block: BlockInputPayload): number {
  return block.floors.reduce((sum, f) => sum + Math.max(0, f.unitsPerFloor || 0), 0);
}

export function totalUnits(blocks: BlockInputPayload[]): number {
  return blocks.reduce((sum, b) => sum + countBlockUnits(b), 0);
}

export interface StructureSummary {
  blocks: number;
  floors: number;
  units: number;
  /** Total monthly rent across every unit, using floor > block > property rent. */
  monthlyRent: number;
  /** Lowest effective unit rent (0 when there are no units). */
  minRent: number;
  /** Highest effective unit rent (0 when there are no units). */
  maxRent: number;
}

/**
 * At-a-glance totals for a block/floor structure: how many blocks, floors and
 * units it produces, and the resulting monthly rent roll. Updates live as the
 * editor changes, so it doubles as a preview before saving.
 */
export function summarizeStructure(blocks: BlockInputPayload[], baseRent = 0): StructureSummary {
  let floors = 0;
  let units = 0;
  let monthlyRent = 0;
  let minRent = 0;
  let maxRent = 0;
  let priced = false;

  for (const block of blocks) {
    for (const floor of block.floors) {
      floors += 1;
      const count = Math.max(0, floor.unitsPerFloor || 0);
      if (count === 0) continue;
      units += count;
      const rent = effectiveRent(null, floor.rentOverride, block.rentOverride, baseRent);
      monthlyRent += rent * count;
      minRent = priced ? Math.min(minRent, rent) : rent;
      maxRent = priced ? Math.max(maxRent, rent) : rent;
      priced = true;
    }
  }

  return {
    blocks: blocks.length,
    floors,
    units,
    monthlyRent,
    minRent: priced ? minRent : 0,
    maxRent: priced ? maxRent : 0,
  };
}

/** Returns a list of human-readable validation errors for the structure. */
export function validateBlocks(blocks: BlockInputPayload[]): string[] {
  const errors: string[] = [];
  const blockNames = new Set<string>();
  for (const block of blocks) {
    const name = block.name.trim();
    if (!name) {
      errors.push("Every block needs a name.");
      continue;
    }
    const key = name.toLowerCase();
    if (blockNames.has(key)) errors.push(`Duplicate block name: ${name}`);
    blockNames.add(key);

    for (const floor of block.floors) {
      const names = buildUnitNames(floor.level, floor.unitsPerFloor, floor.unitNames);
      const seen = new Set<string>();
      for (const n of names) {
        const nk = n.trim().toLowerCase();
        if (seen.has(nk)) errors.push(`Duplicate unit name "${n}" in ${name}.`);
        seen.add(nk);
      }
    }
  }
  if (totalUnits(blocks) > MAX_UNITS_PER_PROPERTY) {
    errors.push(`A property may have at most ${MAX_UNITS_PER_PROPERTY} units.`);
  }
  return errors;
}

export const PropertyStructureEditor = ({
  blocks,
  onChange,
  baseRent = 0,
  disabled = false,
}: PropertyStructureEditorProps) => {
  const update = (next: BlockInputPayload[]) => onChange(next);

  const updateBlock = (blockIndex: number, patch: Partial<BlockInputPayload>) => {
    update(blocks.map((b, i) => (i === blockIndex ? { ...b, ...patch } : b)));
  };

  const updateFloor = (
    blockIndex: number,
    floorIndex: number,
    patch: Partial<FloorInputPayload>,
  ) => {
    update(
      blocks.map((b, i) =>
        i === blockIndex
          ? { ...b, floors: b.floors.map((f, j) => (j === floorIndex ? { ...f, ...patch } : f)) }
          : b,
      ),
    );
  };

  const addBlock = () => update([...blocks, emptyBlock(blocks.length)]);
  const removeBlock = (blockIndex: number) => update(blocks.filter((_, i) => i !== blockIndex));
  const addFloor = (blockIndex: number) =>
    updateBlock(blockIndex, { floors: [...blocks[blockIndex].floors, emptyFloor()] });
  const removeFloor = (blockIndex: number, floorIndex: number) =>
    updateBlock(blockIndex, {
      floors: blocks[blockIndex].floors.filter((_, j) => j !== floorIndex),
    });

  const total = totalUnits(blocks);
  const errors = validateBlocks(blocks);

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="flex items-center gap-2">
            <DoorOpen className="h-4 w-4" /> Blocks &amp; units
          </Label>
          <p className="text-xs text-muted-foreground">
            Optional. Add blocks, floors and how many units each floor holds. Units are named
            automatically (e.g. 3A, GB) and can be renamed later.
          </p>
        </div>
        <span className="shrink-0 text-xs font-medium text-muted-foreground">{total} units</span>
      </div>

      {blocks.map((block, blockIndex) => (
        <div key={blockIndex} className="space-y-2 rounded-md border border-border/70 p-3">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor={`block-name-${blockIndex}`}>Block name</Label>
              <Input
                id={`block-name-${blockIndex}`}
                value={block.name}
                disabled={disabled}
                onChange={(e) => updateBlock(blockIndex, { name: e.target.value })}
                placeholder="e.g. Block A"
              />
            </div>
            <div className="w-40 space-y-1">
              <Label htmlFor={`block-rent-${blockIndex}`}>Rent override</Label>
              <Input
                id={`block-rent-${blockIndex}`}
                type="number"
                min={0}
                disabled={disabled}
                placeholder={baseRent ? String(baseRent) : "KES"}
                value={block.rentOverride ?? ""}
                onChange={(e) =>
                  updateBlock(blockIndex, {
                    rentOverride: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove ${block.name}`}
              disabled={disabled}
              onClick={() => removeBlock(blockIndex)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2">
            {block.floors.map((floor, floorIndex) => {
              const preview = buildUnitNames(floor.level, floor.unitsPerFloor, floor.unitNames);
              return (
                <div
                  key={floorIndex}
                  className="grid grid-cols-[1fr_1fr_1fr_auto_auto] items-end gap-2"
                >
                  <div className="space-y-1">
                    <Label htmlFor={`floor-level-${blockIndex}-${floorIndex}`}>Level</Label>
                    <Input
                      id={`floor-level-${blockIndex}-${floorIndex}`}
                      type="number"
                      min={-5}
                      disabled={disabled}
                      value={floor.level}
                      onChange={(e) =>
                        updateFloor(blockIndex, floorIndex, { level: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`floor-label-${blockIndex}-${floorIndex}`}>Label</Label>
                    <Input
                      id={`floor-label-${blockIndex}-${floorIndex}`}
                      disabled={disabled}
                      value={floor.label ?? ""}
                      placeholder={floor.level === 0 ? "Ground" : `Floor ${floor.level}`}
                      onChange={(e) =>
                        updateFloor(blockIndex, floorIndex, { label: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`floor-units-${blockIndex}-${floorIndex}`}>Units</Label>
                    <Input
                      id={`floor-units-${blockIndex}-${floorIndex}`}
                      type="number"
                      min={0}
                      disabled={disabled}
                      value={floor.unitsPerFloor}
                      onChange={(e) =>
                        updateFloor(blockIndex, floorIndex, {
                          unitsPerFloor: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <span className="pb-2 text-xs text-muted-foreground" title={preview.join(", ")}>
                    {preview.length > 0
                      ? preview.length > 4
                        ? `${preview.slice(0, 4).join(", ")}…`
                        : preview.join(", ")
                      : "—"}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove floor"
                    disabled={disabled || block.floors.length === 1}
                    onClick={() => removeFloor(blockIndex, floorIndex)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => addFloor(blockIndex)}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Add floor
            </Button>
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={addBlock}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Add block
      </Button>

      {errors.length > 0 && (
        <ul className="list-inside list-disc text-xs text-destructive">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

export interface PropertyStructurePreviewProps {
  blocks: BlockInputPayload[];
}

/**
 * Read-only rendering of a saved block/floor structure. This is what the
 * structure page shows by default; the editable {@link PropertyStructureEditor}
 * is only revealed after the user clicks Edit.
 */
export function PropertyStructurePreview({ blocks }: PropertyStructurePreviewProps) {
  if (blocks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        <DoorOpen className="mx-auto mb-2 h-6 w-6 opacity-50" />
        No blocks yet. Click <span className="font-medium text-foreground">Edit</span> to add blocks
        and floors.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {blocks.map((block, blockIndex) => (
        <div key={block.id ?? blockIndex} className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{block.name || `Block ${blockIndex + 1}`}</span>
            {block.rentOverride != null && (
              <Badge variant="secondary">Rent {formatKES(block.rentOverride)}</Badge>
            )}
          </div>
          <ul className="space-y-1.5">
            {block.floors.map((floor, floorIndex) => {
              const names = buildUnitNames(floor.level, floor.unitsPerFloor, floor.unitNames);
              const floorLabel =
                floor.label?.trim() || (floor.level === 0 ? "Ground" : `Floor ${floor.level}`);
              return (
                <li
                  key={floor.id ?? floorIndex}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm"
                >
                  <span className="text-muted-foreground">
                    {floorLabel}
                    {floor.rentOverride != null && (
                      <span className="ml-2 text-xs">· rent {formatKES(floor.rentOverride)}</span>
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    {names.length === 0
                      ? "No units"
                      : `${names.length} ${names.length === 1 ? "unit" : "units"} · ${
                          names.length > 6 ? `${names.slice(0, 6).join(", ")}…` : names.join(", ")
                        }`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
