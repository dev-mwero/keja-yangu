"use client";

import { Plus, TrendingUp, Users, Building2 } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { properties, tenants, caretakers } from "@/data/properties";
import { ownerNav as nav } from "@/config/dashboardNav";

const OwnerDashboard = () => {
  const total = properties.length;
  const occupied = properties.filter((p) => p.status === "occupied").length;
  const occupancy = Math.round((occupied / total) * 100);

  const distribution = [
    { type: "Apartment", count: properties.filter((p) => p.type === "apartment").length },
    { type: "Building", count: properties.filter((p) => p.type === "building").length },
    { type: "Room", count: properties.filter((p) => p.type === "room").length },
  ];
  const max = Math.max(...distribution.map((d) => d.count));

  return (
    <DashboardShell role="Owner" nav={nav} title="Portfolio overview" subtitle="Your buildings, people, and performance at a glance.">
      <div className="mb-6 flex justify-end">
        <Button className="rounded-full"><Plus className="mr-2 h-4 w-4" />New property</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Total properties" value={total} icon={Building2} />
        <StatCard label="Tenants" value={tenants.length} icon={Users} />
        <StatCard label="Caretakers" value={caretakers.length} icon={Users} />
        <StatCard label="Occupancy" value={`${occupancy}%`} icon={TrendingUp} hint="vs 62% last quarter" />
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6 shadow-soft">
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
          <p className="text-xs uppercase tracking-widest text-primary-glow">Monthly revenue</p>
          <p className="mt-2 font-display text-4xl font-semibold">KES 1.84M</p>
          <p className="mt-1 text-sm text-secondary-foreground/70">+12% vs last month</p>
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
              {properties.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.title}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">{p.type}</TableCell>
                  <TableCell className="text-muted-foreground">{p.location}</TableCell>
                  <TableCell>
                    <div className="flex -space-x-2">
                      {p.caretakerIds.map((id) => {
                        const c = caretakers.find((x) => x.id === id);
                        return (
                          <div key={id} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card gradient-warm text-[10px] font-semibold text-primary-foreground">
                            {c?.name.split(" ").map((n) => n[0]).join("")}
                          </div>
                        );
                      })}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline" className="capitalize">{p.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardShell>
  );
};

export default OwnerDashboard;
