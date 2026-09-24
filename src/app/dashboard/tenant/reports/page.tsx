"use client";

import { CheckCircle2, Download, FileBarChart, FileText, Wallet, Wrench } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/DashboardShell";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tenantNav } from "@/config/dashboardNav";
import { type Complaint, complaintsStore } from "@/data/dashboard";
import { useTenantApplications } from "@/hooks/use-applications";
import { useAuth } from "@/hooks/use-auth";
import { useLocalStore } from "@/hooks/use-local-store";
import { useMyInvoices } from "@/hooks/use-my-invoices";
import { formatKES, toISODate } from "@/lib/format";

const withinRange = (date?: string, from?: string, to?: string): boolean => {
  if (!date) return false;
  const start = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
  const end = to ? new Date(`${to}T23:59:59`).getTime() : Infinity;
  const value = new Date(date).getTime();
  return value >= start && value <= end;
};

const TenantReportsPage = () => {
  const { user } = useAuth();
  const { applications } = useTenantApplications(user?.email);
  const { invoices } = useMyInvoices();
  const { items: complaints } = useLocalStore<Complaint>(complaintsStore);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const inRangePaid = invoices.filter(
    (i) => i.status === "paid" && withinRange(i.paidAt, from, to),
  );
  const inRangeComplaints = complaints.filter((c) => withinRange(c.createdAt, from, to));
  const withinRangeApplications = applications.filter((a) => withinRange(a.submittedAt, from, to));

  const paidTotal = inRangePaid.reduce((sum, i) => sum + i.amountDue, 0);
  const resolvedComplaints = inRangeComplaints.filter((c) => c.status === "resolved").length;

  const exportJson = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      range: { from: from || null, to: to || null },
      payments: inRangePaid.map((i) => ({
        period: i.period,
        invoiceNumber: i.invoiceNumber,
        amount: i.amountDue,
        paidAt: i.paidAt,
        method: i.method,
      })),
      applications: withinRangeApplications.map((a) => ({
        propertyTitle: a.propertyTitle,
        status: a.status,
        submittedAt: a.submittedAt,
      })),
      complaints: inRangeComplaints.map((c) => ({
        subject: c.subject,
        category: c.category,
        status: c.status,
        priority: c.priority,
      })),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `keja-tenant-report-${toISODate(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported");
  };

  return (
    <DashboardShell
      roleName="Tenant"
      nav={tenantNav}
      title="Reports"
      subtitle="A snapshot of your payments, applications and complaints."
    >
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="space-y-1.5">
          <div className="text-sm font-medium text-muted-foreground">From</div>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-44"
          />
        </div>
        <div className="space-y-1.5">
          <div className="text-sm font-medium text-muted-foreground">To</div>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
        </div>
        <Button variant="outline" className="rounded-full" onClick={exportJson}>
          <Download className="h-4 w-4" />
          Export JSON
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Paid in range"
          value={formatKES(paidTotal)}
          hint={`${inRangePaid.length} payment${inRangePaid.length === 1 ? "" : "s"}`}
          icon={Wallet}
        />
        <StatCard label="Applications" value={withinRangeApplications.length} icon={FileText} />
        <StatCard
          label="Complaints resolved"
          value={`${resolvedComplaints}/${inRangeComplaints.length}`}
          icon={Wrench}
        />
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <h3 className="font-display text-lg font-semibold">Summary</h3>
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Applications approved</dt>
              <dd className="font-medium">
                {withinRangeApplications.filter((a) => a.status === "approved").length}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Applications pending</dt>
              <dd className="font-medium">
                {withinRangeApplications.filter((a) => a.status === "pending").length}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Open complaints</dt>
              <dd className="font-medium">
                {inRangeComplaints.filter((c) => c.status !== "resolved").length}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Average payment</dt>
              <dd className="font-medium">
                {inRangePaid.length > 0
                  ? formatKES(Math.round(paidTotal / inRangePaid.length))
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            <h3 className="font-display text-lg font-semibold">Invoices by status</h3>
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Paid</dt>
              <dd className="font-medium">{invoices.filter((i) => i.status === "paid").length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Pending</dt>
              <dd className="font-medium">
                {invoices.filter((i) => i.status === "pending").length}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Overdue</dt>
              <dd className="font-medium">
                {invoices.filter((i) => i.status === "overdue").length}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Largest bill</dt>
              <dd className="font-medium">
                {formatKES(Math.max(0, ...invoices.map((i) => i.amountDue)))}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center">
        <FileBarChart className="mx-auto h-8 w-8 text-muted-foreground" />
        <h3 className="mt-3 font-display text-lg font-semibold">Want a PDF statement?</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Set a date range above and export JSON, or ask the landlord for a printed statement from
          the office.
        </p>
      </div>
    </DashboardShell>
  );
};

export default TenantReportsPage;
