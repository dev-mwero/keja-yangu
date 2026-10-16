"use client";

import { ArrowLeft, Loader2, Save } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DashboardShell } from "@/components/DashboardShell";
import {
  PropertyStructureEditor,
  validateBlocks,
} from "@/components/property/PropertyStructureEditor";
import { Button } from "@/components/ui/button";
import type { DashNavItem } from "@/config/dashboardNav";
import {
  type BlockInputPayload,
  type Property,
  toBlockPayloads,
  usePropertyMutations,
} from "@/hooks/use-properties";

interface Props {
  propertyId: string;
  nav: DashNavItem[];
  roleName: string;
  /** Dashboard path to return to (e.g. `/dashboard/owner/portfolio`). */
  backHref: string;
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

  const handleSave = async () => {
    if (errors.length > 0) {
      toast.error("Fix the structure issues before saving.");
      return;
    }
    try {
      const updated = await updateStructure(propertyId, blocks);
      setProperty(updated);
      setBlocks(toBlockPayloads(updated));
      toast.success("Structure saved", {
        description: "Blocks, floors and units have been updated.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save structure");
    }
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
        <div className="max-w-3xl space-y-4">
          <PropertyStructureEditor
            blocks={blocks}
            onChange={setBlocks}
            baseRent={property?.price ?? 0}
            disabled={pending}
          />
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={pending || errors.length > 0}>
              {pending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1 h-4 w-4" />
              )}
              Save structure
            </Button>
            <p className="text-xs text-muted-foreground">
              Occupied units are preserved; blocks and floors holding tenants cannot be removed.
            </p>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
