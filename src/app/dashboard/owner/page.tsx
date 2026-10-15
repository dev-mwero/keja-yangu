"use client";

import { Building2, Plus, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ownerNav as nav } from "@/config/dashboardNav";
import { useAmounts } from "@/hooks/use-amounts";
import { useCaretakers } from "@/hooks/use-caretakers";
import { useProperties } from "@/hooks/use-properties";
import { useTenants } from "@/hooks/use-tenants";
import { formatKES, formatPeriod } from "@/lib/format";
import { propertyTypeLabel } from "@/lib/property-types";

const OwnerDashboard = () => {
  const { properties, loading } = useProperties();
  const { tenants } = useTenants();
  const { caretakers } = useCaretakers();
  const { amounts, loading: amountsLoading } = useAmounts();
  const total = properties.length;
  const occupied = properties.filter((p) => p.status === "occupied").length;
  const occupancy = total > 0 ? Math.round((occupied / total) * 100) : 0;

  const typeCounts = new Map<string, number>();
  for (const property of properties) {
    typeCounts.set(property.type, (typeCounts.get(property.type) ?? 0) + 1);
  }
  const distribution = [...typeCounts.entries()].map(([type, count]) => ({
    type: propertyTypeLabel(type),
    count,
  }));
  const max = Math.max(...distribution.map((d) => d.count), 1);

  // Amount bars are derived from the API rollup — never authored by hand.
  const amountBars = [
    { label: "Expected", value: amounts.expectedAmount },
    { label: "Actual", value: amounts.actualAmount },
    { label: "Paid", value: amounts.paidAmount },
  ];
  const maxAmount = Math.max(...amountBars.map((b) => b.value), 1);
  const hasAmounts = amountBars.some((b) => b.value > 0);

  return (
    <DashboardShell
      roleName="Owner"
      nav={nav}
      title="Portfolio overview"
      subtitle="Your buildings, people, and performance at a glance."
    >
      <div className="mb-6 flex justify-end">
        <Button asChild className="rounded-full">
          <Link href="/dashboard/owner/portfolio">
            <Plus className="mr-2 h-4 w-4" />
            New property
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Total properties"
          value={loading ? "..." : total}
          icon={Building2}
          href="/dashboard/owner/portfolio"
        />
        <StatCard
          label="Tenants"
          value={tenants.length}
          icon={Users}
          href="/dashboard/owner/tenants"
        />
        <StatCard
          label="Caretakers"
          value={caretakers.length}
          icon={Users}
          href="/dashboard/owner/team"
        />
        <StatCard
          label="Occupancy"
          value={loading ? "..." : `${occupancy}%`}
          icon={TrendingUp}
          hint={loading ? "…" : `${occupied} of ${total} properties`}
          href="/dashboard/owner/reports"
        />
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
          <p className="mt-2 font-display text-4xl font-semibold">
            {amountsLoading ? "…" : formatKES(amounts.actualAmount)}
          </p>
          <p className="mt-1 text-sm text-secondary-foreground/70">
            {amounts.period
              ? `${formatPeriod(amounts.period)} · ${amounts.invoiceCount} invoices`
              : "No amount data yet"}
          </p>
          <dl className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-secondary-foreground/70">Expected</dt>
              <dd className="font-medium">
                {amountsLoading ? "…" : formatKES(amounts.expectedAmount)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-secondary-foreground/70">Paid</dt>
              <dd className="font-medium">
                {amountsLoading ? "…" : formatKES(amounts.paidAmount)}
              </dd>
            </div>
          </dl>
          <div className="mt-6 flex h-24 items-end gap-3">
            {amountBars.map((bar) => (
              <div key={bar.label} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-sm gradient-warm transition-all duration-700"
                    style={{
                      height: hasAmounts
                        ? `${Math.max(4, Math.round((bar.value / maxAmount) * 100))}%`
                        : "0%",
                    }}
                  />
                </div>
                <span className="text-[10px] uppercase tracking-wider text-secondary-foreground/70">
                  {bar.label}
                </span>
              </div>
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
              {loading ? (
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
                        {p.caretakerIds.map((id) => {
                          const c = caretakers.find((x) => x.id === id);
                          return (
                            <div
                              key={id}
                              className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card gradient-warm text-[10px] font-semibold text-primary-foreground"
                            >
                              {c?.name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")}
                            </div>
                          );
                        })}
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

export default OwnerDashboard;
