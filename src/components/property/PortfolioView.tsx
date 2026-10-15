"use client";

import { Banknote, Building2, CheckCircle2, Clock, Plus } from "lucide-react";
import { useState } from "react";

import { DashboardShell } from "@/components/DashboardShell";
import { PropertyDialog } from "@/components/dialogs/PropertyDialog";
import { PropertyCardWithActions } from "@/components/property/PropertyCardWithActions";
import { SearchInput } from "@/components/SearchInput";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DashNavItem } from "@/config/dashboardNav";
import { useAmounts } from "@/hooks/use-amounts";
import { useProperties } from "@/hooks/use-properties";
import { formatKES } from "@/lib/format";
import { matchesQuery } from "@/lib/search";

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
  const { amounts } = useAmounts();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const counts: Record<Filter, number> = {
    all: properties.length,
    available: properties.filter((p) => p.status === "available").length,
    occupied: properties.filter((p) => p.status === "occupied").length,
    maintenance: properties.filter((p) => p.status === "maintenance").length,
  };

  const visible = filter === "all" ? properties : properties.filter((p) => p.status === filter);
  const matching = visible.filter((p) => matchesQuery(query, p.title, p.location, p.type));

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
        <StatCard
          label="Potential Monthly Rent"
          value={formatKES(amounts.potentialMonthlyRent)}
          hint={`${amounts.unitCount} rentable units at full occupancy`}
          icon={Banknote}
        />
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
        <div className="flex items-center gap-3">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search properties…"
            className="w-full sm:w-64"
          />
          <Button className="rounded-full" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Add property
          </Button>
        </div>
      </div>

      <div className="mt-6">
        {loading ? (
          <p className="text-muted-foreground">Loading properties…</p>
        ) : matching.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
            <Building2 className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 font-display text-xl">No properties in this view</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {query.trim()
                ? "Try a different search or filter."
                : "Change the filter to see more."}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {matching.map((p) => (
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
