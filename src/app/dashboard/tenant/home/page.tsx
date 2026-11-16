"use client";

import { Building2, DoorOpen, Layers, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { TenantComplaintsPanel } from "@/components/tenant/TenantComplaintsPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { tenantNav } from "@/config/dashboardNav";
import { useMyTenancy } from "@/hooks/use-my-tenancy";
import { useUnits } from "@/hooks/use-units";
import { formatKES } from "@/lib/format";

const TenantHomePage = () => {
  const {
    tenancies: tenanciesRaw,
    tenancy: primaryTenancy,
    loading: tenancyLoading,
  } = useMyTenancy();
  const tenancies = tenanciesRaw ?? (primaryTenancy ? [primaryTenancy] : []);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activeTenancy =
    (selectedId && tenancies.find((t) => t._id === selectedId)) ||
    primaryTenancy ||
    tenancies[0] ||
    null;

  const { units } = useUnits(
    activeTenancy?.propertyId ? { propertyId: activeTenancy.propertyId } : undefined,
    { enabled: Boolean(activeTenancy?.propertyId) },
  );

  // The occupant's unit: bound to their userId (array includes their userId), or
  // their tenant record id / an unlinked legacy unit.
  const unit = units.find(
    (u) =>
      u.status === "occupied" &&
      (!u.tenantId.length ||
        u.tenantId.includes(activeTenancy?.userId ?? "") ||
        u.tenantId.includes(activeTenancy?._id ?? "")),
  );

  return (
    <DashboardShell
      roleName="Tenant"
      nav={tenantNav}
      title="My Home"
      subtitle="Your unit at a glance and the requests you've raised."
    >
      {tenancies.length > 1 && (
        <div className="mb-6 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Active tenancy</span>
          <Select value={activeTenancy?._id ?? ""} onValueChange={setSelectedId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select tenancy" />
            </SelectTrigger>
            <SelectContent>
              {tenancies.map((t) => (
                <SelectItem key={t._id} value={t._id}>
                  {t.name} · {t.propertyId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {tenancyLoading ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-muted-foreground">
          Loading your home…
        </div>
      ) : unit ? (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <DoorOpen className="h-6 w-6" />
              </div>
              <div>
                <h2 className="font-display text-2xl font-semibold tracking-tight">
                  Unit {unit.name}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {unit.blockName ? `Block ${unit.blockName}` : activeTenancy?.name}
                </p>
              </div>
            </div>
            <Badge className="bg-success/15 text-success capitalize hover:opacity-100">
              Occupied
            </Badge>
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border p-4">
              <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                <Layers className="h-4 w-4" /> Floor
              </dt>
              <dd className="mt-1 font-display text-lg font-semibold">
                {unit.floorLabel || unit.floorLevel || "—"}
              </dd>
            </div>
            <div className="rounded-xl border border-border p-4">
              <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                <Wallet className="h-4 w-4" /> Monthly rent
              </dt>
              <dd className="mt-1 font-display text-lg font-semibold">
                {unit.rent != null ? formatKES(unit.rent) : "—"}
              </dd>
            </div>
            <div className="rounded-xl border border-border p-4">
              <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                <DoorOpen className="h-4 w-4" /> Beds / baths
              </dt>
              <dd className="mt-1 font-display text-lg font-semibold">
                {unit.beds} / {unit.baths}
              </dd>
            </div>
            <div className="rounded-xl border border-border p-4">
              <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                <Building2 className="h-4 w-4" /> Area
              </dt>
              <dd className="mt-1 font-display text-lg font-semibold">
                {unit.area ? `${unit.area} m²` : "—"}
              </dd>
            </div>
          </dl>

          {activeTenancy?.joinedAt && (
            <p className="mt-4 text-xs text-muted-foreground">
              Moved in {new Date(activeTenancy.joinedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <DoorOpen className="mx-auto h-8 w-8 text-muted-foreground" />
          <h3 className="mt-3 font-display text-xl">No unit yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Once you're approved and moved into a unit, it will appear here.
          </p>
          <Button asChild className="mt-5 rounded-full">
            <Link href="/properties">Browse homes</Link>
          </Button>
        </div>
      )}

      <div className="mt-10">
        <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight">
          Complaints & requests
        </h2>
        <TenantComplaintsPanel />
      </div>
    </DashboardShell>
  );
};

export default TenantHomePage;
