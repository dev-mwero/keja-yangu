"use client";

import { useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { BlockInputPayload } from "@/hooks/use-properties";
import { generateBulkStructure, validateBulkGeneration } from "@/lib/bulk-structure";

const bulkSchema = z.object({
  blockName: z.string().trim().min(1, "Block name is required").max(80),
  floors: z.coerce.number().int().min(0).max(200),
  unitsPerFloor: z.coerce.number().int().min(0).max(200),
  includeGroundFloor: z.boolean(),
  startLevel: z.coerce.number().int().min(-5).max(200),
  duplex: z.boolean(),
  rentOverride: z.string().optional(),
});

type BulkForm = z.infer<typeof bulkSchema>;

interface BulkGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blocks: BlockInputPayload[];
  onChange: (blocks: BlockInputPayload[]) => void;
  disabled?: boolean;
  existingUnitCount?: number;
}

export function BulkGenerateDialog({
  open,
  onOpenChange,
  blocks,
  onChange,
  disabled = false,
  existingUnitCount = 0,
}: BulkGenerateDialogProps) {
  const [form, setForm] = useState<BulkForm>({
    blockName: "Block A",
    floors: 3,
    unitsPerFloor: 4,
    includeGroundFloor: true,
    startLevel: 1,
    duplex: false,
    rentOverride: "",
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmReplace, setConfirmReplace] = useState(false);

  const handleGenerate = () => {
    const parsed = bulkSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((i) => i.message));
      return;
    }

    const rentOverride =
      form.rentOverride && form.rentOverride.trim() !== "" ? Number(form.rentOverride) : null;

    const spec = {
      name: form.blockName,
      duplex: form.duplex,
      rentOverride,
      floors: {
        floorCount: form.floors,
        unitsPerFloor: form.unitsPerFloor,
        includeGroundFloor: form.includeGroundFloor,
        startLevel: form.startLevel,
        floorRentOverride: rentOverride,
        duplex: form.duplex,
      },
    };

    const validationErrors = validateBulkGeneration({
      blocks: [spec],
      existingUnitCount: blocks.length > 0 ? existingUnitCount : 0,
    });

    // If there are existing blocks and we're not appending, prompt for replace.
    if (blocks.length > 0 && !confirmReplace) {
      const ok = window.confirm(
        "This will replace the existing structure. Continue? (Cancel to append instead.)",
      );
      if (!ok) {
        // Append mode: generate and append.
        try {
          const generated = generateBulkStructure({ blocks: [spec], mode: "append" });
          onChange([...blocks, ...generated]);
          setErrors([]);
          onOpenChange(false);
        } catch (e) {
          setErrors([e instanceof Error ? e.message : "Generation failed"]);
        }
        return;
      }
      setConfirmReplace(true);
    }

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      const generated = generateBulkStructure({ blocks: [spec] });
      onChange(generated);
      setErrors([]);
      setConfirmReplace(false);
      onOpenChange(false);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "Generation failed"]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk generate structure</DialogTitle>
          <DialogDescription>
            Generate floors and units automatically. Review before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="bulk-block-name">Block name</Label>
            <Input
              id="bulk-block-name"
              value={form.blockName}
              disabled={disabled}
              onChange={(e) => setForm((f) => ({ ...f, blockName: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="bulk-floors">Floors to generate</Label>
              <Input
                id="bulk-floors"
                type="number"
                min={0}
                max={200}
                disabled={disabled}
                value={form.floors}
                onChange={(e) => setForm((f) => ({ ...f, floors: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bulk-units">Units per floor</Label>
              <Input
                id="bulk-units"
                type="number"
                min={0}
                max={200}
                disabled={disabled}
                value={form.unitsPerFloor}
                onChange={(e) => setForm((f) => ({ ...f, unitsPerFloor: Number(e.target.value) }))}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="bulk-ground"
              checked={form.includeGroundFloor}
              disabled={disabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, includeGroundFloor: Boolean(v) }))}
            />
            <Label htmlFor="bulk-ground">Include ground floor</Label>
          </div>

          {!form.includeGroundFloor && (
            <div className="space-y-1">
              <Label htmlFor="bulk-start">Starting floor level</Label>
              <Input
                id="bulk-start"
                type="number"
                min={-5}
                max={200}
                disabled={disabled}
                value={form.startLevel}
                onChange={(e) => setForm((f) => ({ ...f, startLevel: Number(e.target.value) }))}
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <Switch
              id="bulk-duplex"
              checked={form.duplex}
              disabled={disabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, duplex: Boolean(v) }))}
            />
            <Label htmlFor="bulk-duplex">Duplex (units span 2 floors)</Label>
          </div>

          <div className="space-y-1">
            <Label htmlFor="bulk-rent">Rent override (optional)</Label>
            <Input
              id="bulk-rent"
              type="number"
              min={0}
              disabled={disabled}
              placeholder="Inherit from property"
              value={form.rentOverride ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, rentOverride: e.target.value }))}
            />
          </div>

          {errors.length > 0 && (
            <ul className="list-inside list-disc text-xs text-destructive">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={disabled}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={disabled}>
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
