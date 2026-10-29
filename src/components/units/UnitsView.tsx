"use client";

import {
  CheckCircle2,
  Clock,
  DoorOpen,
  Loader2,
  Pencil,
  Trash2,
  UserMinus,
  UserPlus,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DashboardShell } from "@/components/DashboardShell";
import { SearchInput } from "@/components/SearchInput";
import { StatCard } from "@/components/StatCard";
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
import { useProperties } from "@/hooks/use-properties";
import { usePropertyTenants, useTenantMutations } from "@/hooks/use-tenants";
import { type Unit, type UnitStatus, useUnitMutations, useUnits } from "@/hooks/use-units";
import { UNIT_STATUSES } from "@/lib/domain-enums";
import { effectiveRent } from "@/lib/schemas/structure";
import { matchesQuery } from "@/lib/search";

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
  const [statusFilter, setStatusFilter] = useState<"all" | UnitStatus>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Unit | null>(null);
  const [assigningUnit, setAssigningUnit] = useState<Unit | null>(null);
  const [vacatingUnit, setVacatingUnit] = useState<Unit | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState("");

  const { units, loading, refetch } = useUnits(undefined, { fetchAll: true });
  const { properties } = useProperties();
  const { updateUnit, deleteUnit, pending } = useUnitMutations();
  const { unassignedTenants, loading: tenantsLoading } = usePropertyTenants(
    assigningUnit?.propertyId,
    { enabled: assigningUnit !== null },
  );
  const { assignUnit, vacateUnit, pending: assignPending } = useTenantMutations();

  const [form, setForm] = useState({ name: "", status: "available" as UnitStatus, rent: "" });

  const propertyById = useMemo(
    () => Object.fromEntries(properties.map((p) => [p._id, p])),
    [properties],
  );

  const filtered = units.filter(
    (u) =>
      (statusFilter === "all" || u.status === statusFilter) &&
      matchesQuery(query, u.name, propertyById[u.propertyId]?.title, u.blockName, u.floorLabel),
  );

  const statusCounts = {
    all: units.length,
    occupied: units.filter((u) => u.status === "occupied").length,
    available: units.filter((u) => u.status === "available").length,
    maintenance: units.filter((u) => u.status === "maintenance").length,
  };

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

  const assign = async () => {
    if (!assigningUnit || !selectedTenantId) return;
    try {
      await assignUnit(selectedTenantId, assigningUnit._id);
      toast.success("Tenant assigned", {
        description: `${assigningUnit.name} is now assigned.`,
      });
      setAssigningUnit(null);
      setSelectedTenantId("");
      refetch();
    } catch (err) {
      toast.error("Could not assign tenant", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const vacate = async () => {
    const occupantId = vacatingUnit?.tenantId[0];
    if (!occupantId) return;
    try {
      await vacateUnit(occupantId);
      toast.success("Tenant unassigned", {
        description: `${vacatingUnit.name} is now vacant.`,
      });
      setVacatingUnit(null);
      refetch();
    } catch (err) {
      toast.error("Could not unassign tenant", {
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
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <StatCard label="Total units" value={loading ? "…" : statusCounts.all} icon={DoorOpen} />
        <StatCard
          label="Occupied"
          value={loading ? "…" : statusCounts.occupied}
          icon={CheckCircle2}
        />
        <StatCard label="Vacant" value={loading ? "…" : statusCounts.available} icon={Clock} />
        <StatCard
          label="Maintenance"
          value={loading ? "…" : statusCounts.maintenance}
          icon={Wrench}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search units…"
            className="w-56"
          />
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
                      {unit.status === "available" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Assign tenant to ${unit.name}`}
                          onClick={() => {
                            setSelectedTenantId("");
                            setAssigningUnit(unit);
                          }}
                        >
                          <UserPlus className="h-4 w-4" />
                        </Button>
                      )}
                      {unit.tenantId.length > 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Unassign tenant from ${unit.name}`}
                          onClick={() => setVacatingUnit(unit)}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      )}
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

      <Dialog
        open={assigningUnit !== null}
        onOpenChange={(o) => {
          if (!o && !assignPending) {
            setAssigningUnit(null);
            setSelectedTenantId("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Assign tenant{assigningUnit ? ` to ${assigningUnit.name}` : ""}
            </DialogTitle>
            <DialogDescription>
              Move an unassigned active tenant at this property into this vacant unit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Tenant</Label>
            {tenantsLoading ? (
              <p className="text-sm text-muted-foreground">Loading tenants…</p>
            ) : unassignedTenants.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No unassigned active tenants at this property. Add a tenant first.
              </p>
            ) : (
              <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a tenant" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedTenants.map((t) => (
                    <SelectItem key={t._id} value={t._id}>
                      {t.name} · {t.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAssigningUnit(null);
                setSelectedTenantId("");
              }}
              disabled={assignPending}
            >
              Cancel
            </Button>
            <Button onClick={assign} disabled={!selectedTenantId || assignPending}>
              {assignPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Assign tenant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={vacatingUnit !== null}
        onOpenChange={(o) => {
          if (!o && !assignPending) setVacatingUnit(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Unassign tenant{vacatingUnit ? ` from ${vacatingUnit.name}` : ""}?
            </DialogTitle>
            <DialogDescription>
              This frees the unit. The tenant keeps their account but no longer occupies this unit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setVacatingUnit(null)}
              disabled={assignPending}
            >
              Cancel
            </Button>
            <Button onClick={vacate} disabled={assignPending}>
              {assignPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Unassign tenant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
