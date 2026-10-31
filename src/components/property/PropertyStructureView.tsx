"use client";

import {
  ArrowLeft,
  Building2,
  DoorOpen,
  Layers,
  Loader2,
  Pencil,
  Save,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { DashboardShell } from "@/components/DashboardShell";
import {
  PropertyStructureEditor,
  PropertyStructurePreview,
  summarizeStructure,
  validateBlocks,
} from "@/components/property/PropertyStructureEditor";
import { PropertyUnitsTable } from "@/components/property/PropertyUnitsTable";
import { ServiceFeesManager } from "@/components/service-fees/ServiceFeesManager";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import type { DashNavItem } from "@/config/dashboardNav";
import {
  type BlockInputPayload,
  type Property,
  toBlockPayloads,
  usePropertyMutations,
} from "@/hooks/use-properties";
import { formatKES } from "@/lib/format";

interface Props {
  propertyId: string;
  nav: DashNavItem[];
  roleName: string;
  /** Dashboard path to return to (e.g. `/dashboard/owner/portfolio`). */
  backHref: string;
}

/** Live unit counts by status, from `GET /api/v1/properties/[id]/unit-counts`. */
interface UnitCounts {
  total: number;
  occupied: number;
  vacant: number;
  maintenance: number;
}

/**
 * Dedicated manager view for editing a property's block/floor structure. Units
 * are reconciled server-side: new floors create units, removed floors/blocks
 * (and shrunk floors) only drop *vacant* units, and occupied units block
 * destructive edits.
 */
export function PropertyStructureView({ propertyId, nav, roleName, backHref }: Props) {
  const { updateStructure, pending } = usePropertyMutations();
  const [property, setProperty] = useState<Property | null>(null);
  const [blocks, setBlocks] = useState<BlockInputPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [counts, setCounts] = useState<UnitCounts | null>(null);
  const [editing, setEditing] = useState(false);
  const [unitsRefreshKey, setUnitsRefreshKey] = useState(0);

  const loadCounts = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/properties/${propertyId}/unit-counts`);
      if (!res.ok) return;
      const json = await res.json();
      setCounts(json.data as UnitCounts);
    } catch {
      // Non-fatal: the occupancy strip is supplementary.
    }
  }, [propertyId]);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/properties/${propertyId}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(json.error || "Failed to load property");
          return;
        }
        const data = json.data as Property;
        setProperty(data);
        setBlocks(toBlockPayloads(data));
        setLoadError(null);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Network error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const errors = validateBlocks(blocks);
  const summary = summarizeStructure(blocks, property?.price ?? 0);
  const rentHint =
    summary.units === 0
      ? "No units yet"
      : summary.minRent === summary.maxRent
        ? `${formatKES(summary.minRent)} per unit`
        : `${formatKES(summary.minRent)} – ${formatKES(summary.maxRent)} per unit`;

  const handleSave = async () => {
    if (errors.length > 0) {
      toast.error("Fix the structure issues before saving.");
      return;
    }
    try {
      const updated = await updateStructure(propertyId, blocks);
      setProperty(updated);
      setBlocks(toBlockPayloads(updated));
      setEditing(false);
      setUnitsRefreshKey((k) => k + 1);
      void loadCounts();
      toast.success("Structure saved", {
        description: "Blocks, floors and units have been updated.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save structure");
    }
  };

  const cancelEdit = () => {
    if (property) setBlocks(toBlockPayloads(property));
    setEditing(false);
  };

  return (
    <DashboardShell
      roleName={roleName}
      nav={nav}
      title="Manage structure"
      subtitle={
        property ? `${property.title} · blocks, floors and units` : "Blocks, floors and units"
      }
    >
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link href={backHref}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to portfolio
          </Link>
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading structure…</p>
      ) : loadError ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          {loadError}
        </div>
      ) : (
        <div className="max-w-5xl space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Blocks" value={summary.blocks} icon={Layers} />
            <StatCard label="Floors" value={summary.floors} icon={Building2} />
            <StatCard label="Units" value={summary.units} icon={DoorOpen} />
            <StatCard
              label="Monthly rent"
              value={formatKES(summary.monthlyRent)}
              hint={rentHint}
              icon={Wallet}
            />
          </div>
          {counts && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-2xl border border-border bg-card px-5 py-3 text-sm">
              <span className="text-muted-foreground">
                Current occupancy{" "}
                <span className="text-xs">
                  (saved units — structure edits don&apos;t move tenants)
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-primary" />
                <span className="font-medium">{counts.occupied}</span>
                <span className="text-muted-foreground">occupied</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="font-medium">{counts.vacant}</span>
                <span className="text-muted-foreground">vacant</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="font-medium">{counts.maintenance}</span>
                <span className="text-muted-foreground">maintenance</span>
              </span>
            </div>
          )}

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg">Structure</h2>
                <p className="text-xs text-muted-foreground">
                  Blocks, floors and how many units each floor holds.
                </p>
              </div>
              {!editing && (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="mr-1 h-4 w-4" /> Edit
                </Button>
              )}
            </div>

            {editing ? (
              <>
                <PropertyStructureEditor
                  blocks={blocks}
                  onChange={setBlocks}
                  baseRent={property?.price ?? 0}
                  disabled={pending}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={handleSave} disabled={pending || errors.length > 0}>
                    {pending ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-1 h-4 w-4" />
                    )}
                    Save structure
                  </Button>
                  <Button variant="outline" onClick={cancelEdit} disabled={pending}>
                    Cancel
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Occupied units are preserved; blocks and floors holding tenants cannot be
                    removed.
                  </p>
                </div>
              </>
            ) : (
              <PropertyStructurePreview blocks={blocks} />
            )}
          </section>

          <section className="space-y-3">
            <ServiceFeesManager propertyId={propertyId} />
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="font-display text-lg">Units</h2>
              <p className="text-xs text-muted-foreground">
                Every unit in this property, with its details and per-unit actions.
              </p>
            </div>
            <PropertyUnitsTable
              propertyId={propertyId}
              blocks={property?.blocks ?? []}
              baseRent={property?.price ?? 0}
              propertyPurpose={property?.purpose}
              refreshKey={unitsRefreshKey}
              onChanged={loadCounts}
            />
          </section>
        </div>
      )}
    </DashboardShell>
  );
}
