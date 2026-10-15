"use client";

import { Banknote, Building2, CheckCircle2, Download, Home, Wrench } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/DashboardShell";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { ownerNav as nav } from "@/config/dashboardNav";
import { type MaintenanceTask, tasksStore } from "@/data/dashboard";
import { useAmounts } from "@/hooks/use-amounts";
import { useLocalStore } from "@/hooks/use-local-store";
import { useProperties } from "@/hooks/use-properties";
import { formatKES, formatPeriod, toISODate } from "@/lib/format";
import { propertyTypeLabel } from "@/lib/property-types";

const OwnerReportsPage = () => {
  const { properties, loading } = useProperties();
  const { amounts } = useAmounts();
  const { items: tasks } = useLocalStore<MaintenanceTask>(tasksStore);

  const occupied = properties.filter((p) => p.status === "occupied").length;
  const occupancy = properties.length > 0 ? Math.round((occupied / properties.length) * 100) : 0;
  const billed = amounts.rentBilled;
  const collected = amounts.rentCollected;
  const outstanding = amounts.rentOutstanding;
  const collectionRate = billed > 0 ? Math.round((collected / billed) * 100) : 0;
  const doneTasks = tasks.filter((t) => t.status === "done").length;

  const byType: Record<string, number> = {};
  properties.forEach((p) => {
    byType[p.type] = (byType[p.type] ?? 0) + 1;
  });

  const exportJson = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      portfolio: {
        period: amounts.period,
        properties: properties.length,
        occupied,
        occupancyPercent: occupancy,
        potentialMonthlyRent: amounts.potentialMonthlyRent,
        occupiedMonthlyRent: amounts.occupiedMonthlyRent,
        contractedRent: amounts.contractedRent,
      },
      revenue: {
        period: amounts.period,
        rentBilled: billed,
        rentCollected: collected,
        rentOutstanding: outstanding,
        invoiceCount: amounts.invoiceCount,
      },
      maintenance: { completed: doneTasks, open: tasks.length - doneTasks },
      distributionByType: byType,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `keja-owner-report-${toISODate(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported");
  };

  return (
    <DashboardShell
      roleName="Owner"
      nav={nav}
      title="Reports"
      subtitle="Portfolio performance at a glance."
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Data up to {toISODate(new Date())}</p>
        <Button variant="outline" className="rounded-full" onClick={exportJson}>
          <Download className="h-4 w-4" />
          Export JSON
        </Button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <StatCard
          label="Potential Monthly Rent"
          value={formatKES(amounts.potentialMonthlyRent)}
          hint={loading ? "…" : `${amounts.unitCount} rentable units · current snapshot`}
          icon={Banknote}
        />
        <StatCard label="Occupancy" value={`${occupancy}%`} icon={Home} />
        <StatCard
          label="Collected"
          value={formatKES(collected)}
          hint={`${formatPeriod(amounts.period)} · ${formatKES(outstanding)} outstanding`}
          icon={CheckCircle2}
        />
        <StatCard
          label="Tasks completed"
          value={doneTasks}
          hint={`${tasks.length - doneTasks} still open`}
          icon={Wrench}
        />
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h3 className="font-display text-lg font-semibold">Distribution by type</h3>
          <div className="mt-4 space-y-4">
            {Object.entries(byType).map(([type, count]) => {
              const percent =
                properties.length > 0 ? Math.round((count / properties.length) * 100) : 0;
              return (
                <div key={type}>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{propertyTypeLabel(type)}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h3 className="font-display text-lg font-semibold">Revenue position</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Collection figures for {amounts.period ? formatPeriod(amounts.period) : "—"}; rent-roll
            figures are current monthly snapshots.
          </p>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Invoices issued</dt>
              <dd className="font-medium">{amounts.invoiceCount}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Occupied Monthly Rent</dt>
              <dd className="font-medium">{formatKES(amounts.occupiedMonthlyRent)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Contracted Rent</dt>
              <dd className="font-medium">{formatKES(amounts.contractedRent)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Billed</dt>
              <dd className="font-medium">{formatKES(billed)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Collected</dt>
              <dd className="font-medium">{formatKES(collected)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Outstanding</dt>
              <dd className="font-medium">{formatKES(outstanding)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Collection rate</dt>
              <dd className="font-medium">{billed > 0 ? `${collectionRate}%` : "—"}</dd>
            </div>
          </dl>
          <div className="mt-5 flex items-center gap-2 rounded-xl bg-primary/5 p-3 text-sm text-muted-foreground">
            <Building2 className="h-4 w-4 text-primary" />
            Completing maintenance improves occupancy and collection.
          </div>
        </section>
      </div>
    </DashboardShell>
  );
};

export default OwnerReportsPage;
