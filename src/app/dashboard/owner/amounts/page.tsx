"use client";

import { Banknote, Receipt, Wallet } from "lucide-react";
import { useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { StatCard } from "@/components/StatCard";
import { Input } from "@/components/ui/input";
import { ownerNav } from "@/config/dashboardNav";
import { useAmounts } from "@/hooks/use-amounts";
import { formatKES, formatPeriod } from "@/lib/format";
import { currentPeriod } from "@/lib/invoicing";

const OwnerAmountsPage = () => {
  const [period, setPeriod] = useState(currentPeriod());
  const { amounts, loading, error } = useAmounts({ period });

  return (
    <DashboardShell
      roleName="Owner"
      nav={ownerNav}
      title="Financial Summary"
      subtitle="Payment summary across your portfolio"
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
          label="Expected Total"
          value={loading ? "…" : formatKES(amounts.expectedAmount)}
          hint="All unit rents for this portfolio"
          icon={Banknote}
        />
        <StatCard
          label="Actual Total"
          value={loading ? "…" : formatKES(amounts.actualAmount)}
          hint={`${amounts.invoiceCount} invoices issued`}
          icon={Receipt}
        />
        <StatCard
          label="Paid Total"
          value={loading ? "…" : formatKES(amounts.paidAmount)}
          hint={`${amounts.unitCount} units`}
          icon={Wallet}
        />
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        {amounts.period ? formatPeriod(amounts.period) : "—"} ·{" "}
        {loading
          ? "Loading amounts…"
          : `${amounts.invoiceCount} invoices across ${amounts.unitCount} units`}
      </p>
    </DashboardShell>
  );
};

export default OwnerAmountsPage;
