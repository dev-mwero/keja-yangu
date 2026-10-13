"use client";

import { DoorOpen, Loader2, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DashboardShell } from "@/components/DashboardShell";
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
import type { DashNavItem } from "@/config/dashboardNav";
import { type Unit, type UnitStatus, useUnitMutations, useUnits } from "@/hooks/use-units";
import { useProperties } from "@/hooks/use-properties";
import { UNIT_STATUSES } from "@/lib/domain-enums";
import { effectiveRent } from "@/lib/schemas/structure";

interface Props {
  nav: DashNavItem[];
  roleName: string;
  canManage?: boolean;
}

const STATUS_VARIANT: Record<UnitStatus, "default" | "secondary" | "outline"> = {
  available: "outline",
  occupied: "default",
  maintenance: "secondary",
};

export function UnitsView({ nav, roleName, canManage = true }: Props) {
  const { units, loading, refetch } = useUnits();
  const { properties } = useProperties();
  const { updateUnit, deleteUnit, pending } = useUnitMutations();
  const [statusFilter, setStatusFilter] = useState<"all" | UnitStatus>("all");
  const [editing, setEditing] = useState<Unit | null>(null);
  const [form, setForm] = useState({ name: "", status: "available" as UnitStatus, rent: "" });

  const propertyById = useMemo(
    () => Object.fromEntries(properties.map((p) => [p._id, p])),
    [properties],
  );

  const filtered = units.filter((u) => statusFilter === "all" || u.status === statusFilter);

  const openEdit = (unit: Unit) => {
    setEditing(unit);
    setForm({
      name: unit.name,
      status: unit.status,
      rent: unit.rent === null || unit.rent === undefined ? "" : String(unit.rent),
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await updateUnit(editing._id, {
        name: form.name.trim() || editing.name,
        status: form.status,
        rent: form.rent === "" ? null : Number(form.rent),
      });
      toast.success("Unit updated");
      setEditing(null);
      refetch();
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
    } catch (err) {
      toast.error("Could not delete unit", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const baseRent = (unit: Unit): number => {
    const property = propertyById[unit.propertyId];
    return effectiveRent(unit.rent, null, null, property?.price ?? 0);
  };

  return (
    <DashboardShell
      roleName={roleName}
      nav={nav}
      title="Units"
      subtitle="Every unit across your blocks and floors."
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as "all" | UnitStatus)}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {UNIT_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{filtered.length} units</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unit</TableHead>
              <TableHead>Property</TableHead>
              <TableHead>Block</TableHead>
              <TableHead>Floor</TableHead>
              <TableHead>Rent</TableHead>
              <TableHead>Status</TableHead>
              {canManage && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Loading units…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  <DoorOpen className="mx-auto mb-2 h-6 w-6 opacity-50" />
                  No units found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((unit) => (
                <TableRow key={unit._id}>
                  <TableCell className="font-medium">{unit.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {propertyById[unit.propertyId]?.title ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{unit.blockName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {unit.floorLabel || (unit.floorLevel === 0 ? "Ground" : unit.floorLevel)}
                  </TableCell>
                  <TableCell>KES {baseRent(unit).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[unit.status]} className="capitalize">
                      {unit.status}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(unit)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
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
            <DialogTitle>Edit unit</DialogTitle>
            <DialogDescription>Update the unit name, rent override or status.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="unit-name">Unit name</Label>
              <Input
                id="unit-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit-rent">Rent override (blank = inherit)</Label>
              <Input
                id="unit-rent"
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
    </DashboardShell>
  );
}
