"use client";

import { ArrowRight, Building2, Check, DoorOpen, Loader2, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { DashboardShell } from "@/components/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { tenantNav } from "@/config/dashboardNav";
import { useMoveRequestMutations, useMoveRequests } from "@/hooks/use-move-requests";
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
 * The vacant units at a tenant's property. The primary action is an explicit
 * "Request this unit", which files a move-in request the property manager
 * approves (the same request that ultimately occupies the unit and opens the
 * lease). A tenant can also save a lighter-weight preference for a unit.
 */
export function TenantUnitsView() {
  const { tenancy, loading: tenancyLoading } = useMyTenancy();
  const { units, loading, error } = useUnits({ status: "available" });
  const { preferences, loading: prefsLoading, refetch: refetchPrefs } = useUnitPreferences();
  const { preferUnit, clearPreference, pending: prefPending } = useUnitPreferenceMutations();
  const { moveRequests, refetch: refetchRequests } = useMoveRequests();
  const { create, pending: requestPending } = useMoveRequestMutations();

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

  // Units the tenant already has a pending move-in request for.
  const requestedUnitIds = useMemo(() => {
    const ids = new Set<string>();
    for (const mr of moveRequests) {
      if (mr.type === "move-in" && mr.status === "pending" && mr.unitId) ids.add(mr.unitId);
    }
    return ids;
  }, [moveRequests]);

  const pendingMoveIns = requestedUnitIds.size;

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

  const handleRequest = async (unit: Unit) => {
    const propertyId = tenancy?.propertyId;
    if (!propertyId) {
      toast.error("You have no tenancy on record.");
      return;
    }
    try {
      await create({ type: "move-in", propertyId, unitId: unit._id });
      refetchRequests();
      toast.success("Move-in request submitted", {
        description: `${unit.name} · Block ${unit.blockName} is with your property manager.`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit request");
    }
  };

  const emptyState = (title: string, body: React.ReactNode, action?: React.ReactNode) => (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
      <DoorOpen className="mx-auto h-8 w-8 text-muted-foreground" />
      <h3 className="mt-3 font-display text-xl">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );

  return (
    <DashboardShell
      roleName="Tenant"
      nav={tenantNav}
      title="Vacant units"
      subtitle="Request a unit to move in, or save one as preferred."
    >
      {!tenancyLoading && !tenancy ? (
        emptyState(
          "No tenancy on record",
          "Apply for a home first — once you're admitted you can request a unit here.",
          <Button asChild className="mt-5 rounded-full">
            <Link href="/properties">Browse homes</Link>
          </Button>,
        )
      ) : loading || prefsLoading ? (
        <p className="text-muted-foreground">Loading units…</p>
      ) : error ? (
        <p className="text-destructive">{error}</p>
      ) : units.length === 0 ? (
        emptyState(
          "No vacant units right now",
          "When a unit at your property becomes vacant it will appear here.",
        )
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card/50 p-3 text-sm">
            <span className="text-muted-foreground">
              {pendingMoveIns > 0
                ? `${pendingMoveIns} move-in request(s) awaiting a decision.`
                : "Requesting a unit sends it to your property manager to review."}
            </span>
            <Link
              href="/dashboard/tenant/move-requests"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              Track requests <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {units.map((unit) => {
              const preferred = preferredUnitId === unit._id;
              const requested = requestedUnitIds.has(unit._id);
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
                    <div className="flex items-center gap-1">
                      {preferred && (
                        <Badge className="bg-primary/15 text-primary hover:bg-primary/15">
                          Preferred
                        </Badge>
                      )}
                      {requested && (
                        <Badge variant="outline" className="text-primary">
                          Requested
                        </Badge>
                      )}
                    </div>
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

                  <div className="mt-4 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {rent != null ? `${formatKES(rent)}/mo` : "Rent on request"}
                    </span>
                    <div className="flex items-center gap-2">
                      {preferred ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={prefPending}
                          onClick={() => handleClear(unit)}
                        >
                          {prefPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                          Clear
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={prefPending}
                          onClick={() => handlePrefer(unit)}
                          title="Save as your preferred unit"
                        >
                          {prefPending ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <Star className="mr-1 h-4 w-4" />
                          )}
                          Prefer
                        </Button>
                      )}
                      <Button
                        size="sm"
                        disabled={requestPending || requested}
                        onClick={() => handleRequest(unit)}
                      >
                        {requestPending ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="mr-1 h-4 w-4" />
                        )}
                        Request this unit
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </DashboardShell>
  );
}
