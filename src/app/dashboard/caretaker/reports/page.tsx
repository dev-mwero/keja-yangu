"use client";

import { Banknote, CheckCircle2, Download, Home, Wrench } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/DashboardShell";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type MaintenanceTask, tasksStore } from "@/data/dashboard";
import { useAuth } from "@/hooks/use-auth";
import { useCaretakerNav } from "@/hooks/use-caretaker-nav";
import { useInvoices } from "@/hooks/use-invoices";
import { useLocalStore } from "@/hooks/use-local-store";
import { useProperties } from "@/hooks/use-properties";
import { formatKES, toISODate } from "@/lib/format";

const CaretakerReportsPage = () => {
  const nav = useCaretakerNav();
  const { user } = useAuth();
  const privileged = user?.privileges?.includes("manage_invoices") ?? false;

  const { properties, loading } = useProperties({ caretakerId: user?.id });
  const mine = useMemo(
    () => (user?.id ? properties.filter((p) => p.caretakerIds.includes(user.id)) : []),
    [properties, user?.id],
  );
  const { items: tasks } = useLocalStore<MaintenanceTask>(tasksStore);
  const { invoices, error: invoicesError } = useInvoices();

  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const openTasks = tasks.filter((t) => t.status !== "done").length;
  const collected = invoices
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + i.amountDue, 0);
  const outstanding = invoices
    .filter((i) => i.status === "pending" || i.status === "overdue")
    .reduce((s, i) => s + i.amountDue, 0);
  const occupiedUnits = mine.filter((p) => p.status === "occupied").length;
  const occupancy = mine.length > 0 ? Math.round((occupiedUnits / mine.length) * 100) : 0;

  const exportJson = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      caretaker: user?.name ?? "Caretaker",
      portfolio: mine.map((p) => ({ title: p.title, status: p.status })),
      tasks: { completed: doneTasks, open: openTasks, total: tasks.length },
      ...(privileged ? { rent: { collected, outstanding, invoices: invoices.length } } : {}),
      occupancyPercent: occupancy,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `keja-caretaker-report-${toISODate(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported");
  };

  return (
    <DashboardShell
      roleName="Caretaker"
      nav={nav}
      title="Reports"
      subtitle="A monthly snapshot of the properties you run."
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Data up to {toISODate(new Date())}</p>
        <Button variant="outline" className="rounded-full" onClick={exportJson}>
          <Download className="h-4 w-4" />
          Export JSON
        </Button>
      </div>

      <div className={`mt-6 grid gap-4 ${privileged ? "md:grid-cols-4" : "md:grid-cols-2"}`}>
        <StatCard
          label="Tasks completed"
          value={doneTasks}
          hint={`${openTasks} still open`}
          icon={CheckCircle2}
        />
        {privileged && (
          <>
            <StatCard label="Rent collected" value={formatKES(collected)} icon={Banknote} />
            <StatCard label="Outstanding" value={formatKES(outstanding)} icon={Wrench} />
          </>
        )}
        <StatCard
          label="Occupancy"
          value={`${occupancy}%`}
          hint={loading ? "…" : `${occupiedUnits}/${mine.length} units`}
          icon={Home}
        />
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h3 className="font-display text-lg font-semibold">Task completion</h3>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Completed</span>
              <span className="font-medium">{doneTasks}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">In progress</span>
              <span className="font-medium">
                {tasks.filter((t) => t.status === "in-progress").length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Open</span>
              <span className="font-medium">{tasks.filter((t) => t.status === "open").length}</span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-success"
                style={{
                  width:
                    tasks.length > 0 ? `${Math.round((doneTasks / tasks.length) * 100)}%` : "0%",
                }}
              />
            </div>
          </div>
        </section>

        {privileged && (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <h3 className="font-display text-lg font-semibold">Rent position</h3>
            {invoicesError && <p className="mt-2 text-xs text-destructive">{invoicesError}</p>}
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Collected</span>
                <span className="font-medium">{formatKES(collected)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Outstanding</span>
                <span className="font-medium">{formatKES(outstanding)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Collection rate</span>
                <span className="font-medium">
                  {collected + outstanding > 0
                    ? `${Math.round((collected / (collected + outstanding)) * 100)}%`
                    : "—"}
                </span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width:
                      collected + outstanding > 0
                        ? `${Math.round((collected / (collected + outstanding)) * 100)}%`
                        : "0%",
                  }}
                />
              </div>
            </div>
          </section>
        )}
      </div>

      <section className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <h3 className="font-display text-lg font-semibold">Portfolio occupancy</h3>
        <div className="mt-4 space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading properties…</p>
          ) : mine.length === 0 ? (
            <p className="text-sm text-muted-foreground">No properties assigned.</p>
          ) : (
            mine.map((p) => (
              <div key={p._id} className="flex items-center justify-between text-sm">
                <span className="font-medium">{p.title}</span>
                <Badge variant="outline" className="capitalize">
                  {p.status}
                </Badge>
              </div>
            ))
          )}
        </div>
      </section>
    </DashboardShell>
  );
};

export default CaretakerReportsPage;
