"use client";

import { Building2, Check, DoorOpen, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { DashboardShell } from "@/components/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { tenantNav } from "@/config/dashboardNav";
import { useMyTenancy } from "@/hooks/use-my-tenancy";
import { useUnitPreferenceMutations, useUnitPreferences } from "@/hooks/use-unit-preferences";
import { type Unit, useUnits } from "@/hooks/use-units";
import { formatKES } from "@/lib/format";
import { effectiveRent } from "@/lib/schemas/structure";

interface PropertyLite {
  _id: string;
  title: string;
  price: number;
  blocks: {
    _id: string;
    rentOverride: number | null;
    floors: { _id: string; rentOverride: number | null }[];
  }[];
}

/**
 * Client view of the vacant units at their property. A tenant can mark one unit
 * as their preferred choice; the preference is stored server-side and surfaced
 * to the property's managers.
 */
export function TenantUnitsView() {
  const { tenancy } = useMyTenancy();
  const { units, loading, error } = useUnits({ status: "available" });
  const { preferences, loading: prefsLoading, refetch: refetchPrefs } = useUnitPreferences();
  const { preferUnit, clearPreference, pending } = useUnitPreferenceMutations();

  const [property, setProperty] = useState<PropertyLite | null>(null);

  useEffect(() => {
    const propertyId = tenancy?.propertyId;
    if (!propertyId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/v1/properties/${propertyId}`);
        const json = await res.json();
        if (!cancelled && res.ok) setProperty(json.data as PropertyLite);
      } catch {
        /* rent falls back to the unit/property defaults */
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [tenancy?.propertyId]);

  const preferredUnitId = useMemo(
    () => preferences.find((p) => p.propertyId === tenancy?.propertyId)?.unitId ?? null,
    [preferences, tenancy?.propertyId],
  );

  const rentFor = (unit: Unit): number | null => {
    if (!property) return unit.rent;
    const block = property.blocks.find((b) => b._id === unit.blockId);
    const floor = block?.floors.find((f) => f._id === unit.floorId);
    return effectiveRent(unit.rent, floor?.rentOverride, block?.rentOverride, property.price);
  };

  const handlePrefer = async (unit: Unit) => {
    try {
      await preferUnit(unit._id);
      refetchPrefs();
      toast.success("Unit preferred", { description: `${unit.name} · Block ${unit.blockName}` });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save preference");
    }
  };

  const handleClear = async (unit: Unit) => {
    try {
      await clearPreference(unit._id);
      refetchPrefs();
      toast.success("Preference cleared");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clear preference");
    }
  };

  return (
    <DashboardShell
      roleName="Tenant"
      nav={tenantNav}
      title="Vacant units"
      subtitle="Browse the units available at your property and pick one you prefer."
    >
      {loading || prefsLoading ? (
        <p className="text-muted-foreground">Loading units…</p>
      ) : error ? (
        <p className="text-destructive">{error}</p>
      ) : units.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <DoorOpen className="mx-auto h-8 w-8 text-muted-foreground" />
          <h3 className="mt-3 font-display text-xl">No vacant units right now</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            When a unit at your property becomes vacant it will appear here.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {units.map((unit) => {
            const preferred = preferredUnitId === unit._id;
            const rent = rentFor(unit);
            return (
              <div
                key={unit._id}
                className={`rounded-2xl border bg-card p-5 shadow-soft transition-all ${
                  preferred ? "border-primary ring-1 ring-primary" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-display text-lg font-semibold">{unit.name}</h3>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5" />
                      Block {unit.blockName}
                      {unit.floorLabel ? ` · ${unit.floorLabel}` : ` · Floor ${unit.floorLevel}`}
                    </p>
                  </div>
                  {preferred && (
                    <Badge className="bg-primary/15 text-primary hover:bg-primary/15">
                      Preferred
                    </Badge>
                  )}
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                  <div>
                    <dt>Beds</dt>
                    <dd className="text-foreground">{unit.beds}</dd>
                  </div>
                  <div>
                    <dt>Baths</dt>
                    <dd className="text-foreground">{unit.baths}</dd>
                  </div>
                  <div>
                    <dt>Area</dt>
                    <dd className="text-foreground">{unit.area} m²</dd>
                  </div>
                </dl>

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {rent != null ? `${formatKES(rent)}/mo` : "Rent on request"}
                  </span>
                  {preferred ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => handleClear(unit)}
                    >
                      {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                      Clear
                    </Button>
                  ) : (
                    <Button size="sm" disabled={pending} onClick={() => handlePrefer(unit)}>
                      {pending ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-1 h-4 w-4" />
                      )}
                      Prefer
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardShell>
  );
}
