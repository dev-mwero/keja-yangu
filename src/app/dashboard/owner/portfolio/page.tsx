"use client";

import { Banknote, Building2, CheckCircle2, Clock, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { PropertyCard } from "@/components/PropertyCard";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ownerNav as nav } from "@/config/dashboardNav";
import { useProperties } from "@/hooks/use-properties";
import { formatKES } from "@/lib/format";

type Filter = "all" | "available" | "occupied" | "maintenance";

const OwnerPortfolioPage = () => {
  const { properties, loading } = useProperties();
  const [filter, setFilter] = useState<Filter>("all");

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
      roleName="Owner"
      nav={nav}
      title="Portfolio"
      subtitle="Every property you own, with real-time status."
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
        <Button asChild className="rounded-full">
          <Link href="/properties">
            <Plus className="h-4 w-4" />
            Add property
          </Link>
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
              <PropertyCard
                key={p._id}
                property={{
                  id: p._id,
                  title: p.title,
                  type: p.type,
                  location: p.location,
                  price: p.price,
                  description: p.description,
                  images: p.images.length > 0 ? p.images : ["/images/property-1.jpg"],
                  amenities: p.amenities,
                  status: p.status,
                  ownerId: p.ownerId,
                  caretakerIds: p.caretakerIds,
                  beds: p.beds,
                  baths: p.baths,
                  area: p.area,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
};

export default OwnerPortfolioPage;
