"use client";

import { Clock, Receipt, Wallet } from "lucide-react";
import { useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { StatCard } from "@/components/StatCard";
import { Input } from "@/components/ui/input";
import { tenantNav } from "@/config/dashboardNav";
import { useMyInvoices } from "@/hooks/use-my-invoices";
import { formatKES, formatPeriod } from "@/lib/format";
import { currentPeriod } from "@/lib/invoicing";

const TenantAmountsPage = () => {
  const [period, setPeriod] = useState(currentPeriod());
  const { invoices, loading, error } = useMyInvoices({ period });

  // A tenant has no portfolio-wide rent roll to read, so the meaningful
  // trio is what was billed, what was paid and what is still owed — all
  // derived from the invoice API rather than authored on the page.
  const billed = invoices.reduce((sum, inv) => sum + inv.amountDue, 0);
  const paid = invoices.reduce((sum, inv) => sum + (inv.amountPaid ?? 0), 0);
  const outstanding = invoices.reduce(
    (sum, inv) => sum + Math.max(0, inv.amountDue - (inv.amountPaid ?? 0)),
    0,
  );

  return (
    <DashboardShell
      roleName="Tenant"
      nav={tenantNav}
      title="Financial Summary"
      subtitle="Your payment summary"
    >
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="space-y-1.5">
          <div className="text-sm font-medium text-muted-foreground">Period</div>
          <Input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="w-44"
          />
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Billed"
          value={loading ? "…" : formatKES(billed)}
          hint={`${invoices.length} invoices issued`}
          icon={Receipt}
        />
        <StatCard
          label="Paid"
          value={loading ? "…" : formatKES(paid)}
          hint="Received this period"
          icon={Wallet}
        />
        <StatCard
          label="Outstanding"
          value={loading ? "…" : formatKES(outstanding)}
          hint={outstanding > 0 ? "Still owed" : "Nothing owed"}
          icon={Clock}
        />
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        {period ? formatPeriod(period) : "—"} ·{" "}
        {loading ? "Loading amounts…" : `${invoices.length} invoices`}
      </p>
    </DashboardShell>
  );
};

export default TenantAmountsPage;
