"use client";

import { Banknote, Building2, CheckCircle2, Download, Home, Wrench } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/DashboardShell";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { adminNav as nav } from "@/config/dashboardNav";
import { type MaintenanceTask, tasksStore } from "@/data/dashboard";
import { useAmounts } from "@/hooks/use-amounts";
import { useLocalStore } from "@/hooks/use-local-store";
import { useProperties } from "@/hooks/use-properties";
import { formatKES, formatPeriod, toISODate } from "@/lib/format";
import { propertyTypeLabel } from "@/lib/property-types";

const AdminReportsPage = () => {
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
        collectionRatePercent: collectionRate,
        invoiceCount: amounts.invoiceCount,
      },
      maintenance: {
        totalTasks: tasks.length,
        completedTasks: doneTasks,
        pendingTasks: tasks.length - doneTasks,
      },
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `keja-report-${toISODate(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report downloaded");
  };

  return (
    <DashboardShell
      roleName="Admin"
      nav={nav}
      title="Reports & Analytics"
      subtitle="Financial performance, occupancy metrics, and operational summaries."
    >
      <div className="mb-6 flex justify-end">
        <Button className="rounded-full" onClick={exportJson}>
          <Download className="mr-2 h-4 w-4" />
          Export report
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Occupancy rate"
          value={loading ? "…" : `${occupancy}%`}
          icon={Building2}
          hint={loading ? "…" : `${occupied} of ${properties.length} properties`}
        />
        <StatCard
          label="Collection rate"
          value={billed > 0 ? `${collectionRate}%` : "—"}
          icon={Banknote}
          hint={
            amounts.period
              ? `${formatPeriod(amounts.period)} · ${amounts.invoiceCount} invoices`
              : "No amount data yet"
          }
        />
        <StatCard
          label="Rent outstanding"
          value={formatKES(outstanding)}
          icon={Home}
          hint="Unpaid invoices this period"
        />
        <StatCard
          label="Resolved tasks"
          value={doneTasks}
          icon={CheckCircle2}
          hint={`${tasks.length - doneTasks} pending maintenance`}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h3 className="font-display text-lg font-semibold">Portfolio breakdown</h3>
          <p className="text-xs text-muted-foreground">Properties grouped by type</p>
          <div className="mt-6 space-y-3">
            {Object.keys(byType).length === 0 ? (
              <p className="text-sm text-muted-foreground">No properties yet.</p>
            ) : (
              Object.entries(byType).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between text-sm">
                  <span className="capitalize">{propertyTypeLabel(type)}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h3 className="font-display text-lg font-semibold">Maintenance health</h3>
          <p className="text-xs text-muted-foreground">Recent task resolution status</p>
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                Completed
              </span>
              <span className="font-medium">{doneTasks}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-warning" />
                In progress / open
              </span>
              <span className="font-medium">{tasks.length - doneTasks}</span>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
};

export default AdminReportsPage;
