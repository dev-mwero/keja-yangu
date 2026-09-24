"use client";

import { Banknote, Building2, CheckCircle2, Clock, Plus } from "lucide-react";
import { useState } from "react";

import { DashboardShell } from "@/components/DashboardShell";
import { PropertyDialog } from "@/components/dialogs/PropertyDialog";
import { PropertyCardWithActions } from "@/components/property/PropertyCardWithActions";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DashNavItem } from "@/config/dashboardNav";
import { useProperties } from "@/hooks/use-properties";
import { formatKES } from "@/lib/format";

type Filter = "all" | "available" | "occupied" | "maintenance";

interface PortfolioViewProps {
  nav: DashNavItem[];
  roleName: string;
  systemAdmin?: boolean;
  canSetCaretakerIds?: boolean;
}

export const PortfolioView = ({
  nav,
  roleName,
  systemAdmin = false,
  canSetCaretakerIds = true,
}: PortfolioViewProps) => {
  const { properties, loading, refetch } = useProperties();
  const [filter, setFilter] = useState<Filter>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const counts: Record<Filter, number> = {
    all: properties.length,
    available: properties.filter((p) => p.status === "available").length,
    occupied: properties.filter((p) => p.status === "occupied").length,
    maintenance: properties.filter((p) => p.status === "maintenance").length,
  };

  const visible = filter === "all" ? properties : properties.filter((p) => p.status === filter);
  const rentRoll = properties.reduce((sum, p) => sum + p.price, 0);

  return (
    <DashboardShell
      roleName={roleName}
      nav={nav}
      title="Portfolio"
      subtitle={
        systemAdmin
          ? "Every property in the system, with full control."
          : "Every property you own, with real-time status."
      }
    >
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Properties" value={loading ? "…" : properties.length} icon={Building2} />
        <StatCard label="Occupied" value={counts.occupied} icon={CheckCircle2} />
        <StatCard label="Vacant" value={counts.available} icon={Clock} />
        <StatCard label="Monthly rent roll" value={formatKES(rentRoll)} icon={Banknote} />
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            {(["all", "available", "occupied", "maintenance"] as const).map((f) => (
              <TabsTrigger key={f} value={f}>
                {f === "all" ? "All" : f}
                <span className="ml-1.5 text-xs text-muted-foreground">{counts[f]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button className="rounded-full" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Add property
        </Button>
      </div>

      <div className="mt-6">
        {loading ? (
          <p className="text-muted-foreground">Loading properties…</p>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
            <Building2 className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 font-display text-xl">No properties in this view</h3>
            <p className="mt-1 text-sm text-muted-foreground">Change the filter to see more.</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((p) => (
              <PropertyCardWithActions
                key={p._id}
                property={p}
                canEdit
                canDelete
                allowCaretakerIds={canSetCaretakerIds}
                systemAdmin={systemAdmin}
                onChanged={refetch}
              />
            ))}
          </div>
        )}
      </div>

      <PropertyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        allowCaretakerIds={canSetCaretakerIds}
        systemAdmin={systemAdmin}
        onSuccess={refetch}
      />
    </DashboardShell>
  );
};
