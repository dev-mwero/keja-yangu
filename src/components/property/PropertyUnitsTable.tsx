"use client";

import { DoorOpen, Loader2, Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PropertyBlock } from "@/hooks/use-properties";
import { type Unit, type UnitStatus, useUnitMutations, useUnits } from "@/hooks/use-units";
import { UNIT_STATUSES } from "@/lib/domain-enums";
import { formatKES } from "@/lib/format";
import { effectiveRent } from "@/lib/schemas/structure";

interface Props {
  propertyId: string;
  /** Saved blocks, used to resolve floor/block rent overrides for display. */
  blocks: PropertyBlock[];
  /** Property-level monthly rent — the fallback effective rent. */
  baseRent: number;
  /** Change this to force the list to refetch (e.g. after a structure save). */
  refreshKey?: number;
  canManage?: boolean;
  /** Called after a unit is edited or deleted, so callers can refresh counts. */
  onChanged?: () => void;
}

const STATUS_VARIANT: Record<UnitStatus, "default" | "secondary" | "outline"> = {
  available: "outline",
  occupied: "default",
  maintenance: "secondary",
};

interface EditForm {
  name: string;
  status: UnitStatus;
  rent: string;
  beds: string;
  baths: string;
  area: string;
}

const asField = (value: number | null | undefined): string =>
  value === null || value === undefined ? "" : String(value);

const asNumberOrUndefined = (value: string): number | undefined =>
  value.trim() === "" ? undefined : Number(value);

/**
 * Property-scoped units table for the structure page. Every unit of the
 * property is listed (paging through the API) with its details and per-row
 * edit/delete actions. Deleting an occupied unit is disabled — the API rejects
 * it too.
 */
export function PropertyUnitsTable({
  propertyId,
  blocks,
  baseRent,
  refreshKey = 0,
  canManage = true,
  onChanged,
}: Props) {
  const { units, loading, error, refetch } = useUnits({ propertyId }, { fetchAll: true });
  const { updateUnit, deleteUnit, pending } = useUnitMutations();
  const [editing, setEditing] = useState<Unit | null>(null);
  const [form, setForm] = useState<EditForm>({
    name: "",
    status: "available",
    rent: "",
    beds: "",
    baths: "",
    area: "",
  });

  // Refetch when the parent bumps refreshKey. The initial render is skipped —
  // the hook already fetches on mount.
  const firstRun = useRef(true);
  useEffect(() => {
    void refreshKey;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    refetch();
  }, [refreshKey, refetch]);

  const blockById = useMemo(() => {
    const map = new Map<string, PropertyBlock>();
    for (const block of blocks) map.set(block._id, block);
    return map;
  }, [blocks]);

  const effectiveFor = (unit: Unit): number => {
    const block = blockById.get(unit.blockId);
    const floor = block?.floors.find((f) => f._id === unit.floorId);
    return effectiveRent(
      unit.rent,
      floor?.rentOverride ?? null,
      block?.rentOverride ?? null,
      baseRent,
    );
  };

  const openEdit = (unit: Unit) => {
    setEditing(unit);
    setForm({
      name: unit.name,
      status: unit.status,
      rent: asField(unit.rent),
      beds: asField(unit.beds),
      baths: asField(unit.baths),
      area: asField(unit.area),
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await updateUnit(editing._id, {
        name: form.name.trim() || editing.name,
        status: form.status,
        rent: form.rent === "" ? null : Number(form.rent),
        beds: asNumberOrUndefined(form.beds),
        baths: asNumberOrUndefined(form.baths),
        area: asNumberOrUndefined(form.area),
      });
      toast.success("Unit updated");
      setEditing(null);
      refetch();
      onChanged?.();
    } catch (err) {
      toast.error("Could not update unit", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const remove = async (unit: Unit) => {
    try {
      await deleteUnit(unit._id);
      toast.success("Unit deleted");
      refetch();
      onChanged?.();
    } catch (err) {
      toast.error("Could not delete unit", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const seat = (value: number): string | number => (value > 0 ? value : "—");
  const colSpan = canManage ? 8 : 7;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unit</TableHead>
              <TableHead>Block</TableHead>
              <TableHead>Floor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Beds</TableHead>
              <TableHead className="text-right">Baths</TableHead>
              <TableHead>Rent</TableHead>
              {canManage && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-8 text-center text-muted-foreground">
                  Loading units…
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-8 text-center text-destructive">
                  {error}
                </TableCell>
              </TableRow>
            ) : units.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-8 text-center text-muted-foreground">
                  <DoorOpen className="mx-auto mb-2 h-6 w-6 opacity-50" />
                  No units yet. Add blocks and floors above to create units.
                </TableCell>
              </TableRow>
            ) : (
              units.map((unit) => (
                <TableRow key={unit._id}>
                  <TableCell className="font-medium">{unit.name}</TableCell>
                  <TableCell className="text-muted-foreground">{unit.blockName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {unit.floorLabel || (unit.floorLevel === 0 ? "Ground" : unit.floorLevel)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[unit.status]} className="capitalize">
                      {unit.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{seat(unit.beds)}</TableCell>
                  <TableCell className="text-right tabular-nums">{seat(unit.baths)}</TableCell>
                  <TableCell>{formatKES(effectiveFor(unit))}</TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${unit.name}`}
                        onClick={() => openEdit(unit)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${unit.name}`}
                        disabled={unit.status === "occupied"}
                        onClick={() => remove(unit)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit unit{editing ? ` ${editing.name}` : ""}</DialogTitle>
            <DialogDescription>
              Update the unit name, rent override, size or status.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="prop-unit-name">Unit name</Label>
              <Input
                id="prop-unit-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="prop-unit-beds">Bedrooms</Label>
                <Input
                  id="prop-unit-beds"
                  type="number"
                  min={0}
                  value={form.beds}
                  onChange={(e) => setForm((f) => ({ ...f, beds: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prop-unit-baths">Bathrooms</Label>
                <Input
                  id="prop-unit-baths"
                  type="number"
                  min={0}
                  value={form.baths}
                  onChange={(e) => setForm((f) => ({ ...f, baths: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prop-unit-area">Area (m²)</Label>
                <Input
                  id="prop-unit-area"
                  type="number"
                  min={0}
                  value={form.area}
                  onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prop-unit-rent">Rent override (blank = inherit)</Label>
              <Input
                id="prop-unit-rent"
                type="number"
                min={0}
                value={form.rent}
                onChange={(e) => setForm((f) => ({ ...f, rent: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v as UnitStatus }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={pending}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
