"use client";

import { Building2, TrendingUp, Users } from "lucide-react";

import { DashboardShell } from "@/components/DashboardShell";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { systemAdminNav as nav } from "@/config/dashboardNav";
import { useCaretakers } from "@/hooks/use-caretakers";
import { useProperties } from "@/hooks/use-properties";
import { useTenants } from "@/hooks/use-tenants";

const initials = (name?: string) =>
  (name ?? "")
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();

const SystemAdminDashboard = () => {
  const { properties, loading: propertiesLoading } = useProperties();
  const { tenants, loading: tenantsLoading } = useTenants();
  const { caretakers } = useCaretakers();

  const total = properties.length;
  const occupied = properties.filter((p) => p.status === "occupied").length;
  const occupancy = total > 0 ? Math.round((occupied / total) * 100) : 0;

  const distribution = [
    { type: "Apartment", count: properties.filter((p) => p.type === "apartment").length },
    { type: "Building", count: properties.filter((p) => p.type === "building").length },
    { type: "Room", count: properties.filter((p) => p.type === "room").length },
  ];
  const max = Math.max(...distribution.map((d) => d.count), 1);

  const caretakerNameById = new Map(caretakers.map((c) => [c.id, c.name]));

  return (
    <DashboardShell
      roleName="System Administrator"
      nav={nav}
      title="Platform overview"
      subtitle="Properties, tenants, and caretakers across every owner."
    >
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Total properties"
          value={propertiesLoading ? "..." : total}
          icon={Building2}
        />
        <StatCard label="Tenants" value={tenantsLoading ? "..." : tenants.length} icon={Users} />
        <StatCard label="Caretakers" value={caretakers.length} icon={Users} />
        <StatCard
          label="Occupancy"
          value={propertiesLoading ? "..." : `${occupancy}%`}
          icon={TrendingUp}
        />
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl font-semibold">Property distribution</h3>
            <span className="text-xs text-muted-foreground">By type</span>
          </div>
          <div className="mt-6 space-y-4">
            {distribution.map((d) => (
              <div key={d.type}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium">{d.type}</span>
                  <span className="text-muted-foreground">{d.count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full gradient-warm transition-all duration-1000"
                    style={{ width: `${(d.count / max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-secondary p-6 text-secondary-foreground shadow-elevated">
          <p className="text-xs uppercase tracking-widest text-primary-glow">Platform reach</p>
          <p className="mt-2 font-display text-4xl font-semibold">{caretakers.length}</p>
          <p className="mt-1 text-sm text-secondary-foreground/70">active caretakers</p>
          <div className="mt-6 flex h-20 items-end gap-1.5">
            {[40, 55, 48, 70, 62, 80, 72, 90, 78, 95, 88, 100].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm gradient-warm transition-all duration-700"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-10">
        <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight">All properties</h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Caretakers</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {propertiesLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Loading properties...
                  </TableCell>
                </TableRow>
              ) : properties.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No properties found.
                  </TableCell>
                </TableRow>
              ) : (
                properties.map((p) => (
                  <TableRow key={p._id}>
                    <TableCell className="font-medium">{p.title}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">{p.type}</TableCell>
                    <TableCell className="text-muted-foreground">{p.location}</TableCell>
                    <TableCell>
                      <div className="flex -space-x-2">
                        {p.caretakerIds.map((id) => (
                          <div
                            key={id}
                            className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card gradient-warm text-[10px] font-semibold text-primary-foreground"
                            title={caretakerNameById.get(id) ?? id}
                          >
                            {initials(caretakerNameById.get(id)) || "•"}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className="capitalize">
                        {p.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardShell>
  );
};

export default SystemAdminDashboard;
