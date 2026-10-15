"use client";

import { DashboardShell } from "@/components/DashboardShell";
import { custodianNav } from "@/config/dashboardNav";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/StatCard";
import { formatKES } from "@/lib/format";
import { useMyInvoices } from "@/hooks/use-my-invoices";
import { SearchInput } from "@/components/SearchInput";
import { useState } from "react";
import { currentPeriod } from "@/lib/invoicing";
import { Building2 } from "lucide-react";

const CustodianAmountsPage = () => {
  const { invoices } = useMyInvoices();
  const [period, setPeriod] = useState(currentPeriod());
  const [query, setQuery] = useState("");

  // Compute total amounts from invoices
  const totalActual = invoices.reduce(
    (sum, inv) => sum + inv.amountDue,
    0,
  );
  const totalPaid = invoices.reduce(
    (sum, inv) => sum + (inv.amountPaid ?? 0),
    0,
  );

  // Expected: this is a placeholder - in a full implementation,
  // this would sum unit rents for the custodian's properties
  const totalExpected = 0;

  return (
    <DashboardShell
      roleName="Custodian"
      nav={custodianNav}
      title="Financial Summary"
      subtitle="Payment summary for managed properties"
    >
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="space-y-1.5">
          <div className="text-sm font-medium text-muted-foreground">Period</div>
          <Input
            type="date"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="w-44"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <StatCard
          label="Expected Total"
          value={formatKES(totalExpected)}
          hint="Based on managed property rents"
          icon={Building2}
        />
        <StatCard
          label="Actual Total"
          value={formatKES(totalActual)}
          hint={`${invoices.length} invoices`}
          icon={Building2}
        />
        <StatCard
          label="Paid Total"
          value={formatKES(totalPaid)}
          hint="${invoices.length} invoices"
          icon={Building2}
        />
      </div>

      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search invoices…"
        className="w-full sm:w-56"
      />

      <div className="mt-8">
        <p>You have {invoices.length} invoices.</p>
        <p>Total actual: {formatKES(totalActual)}</p>
        <p>Total paid: {formatKES(totalPaid)}</p>
      </div>
    </DashboardShell>
  );
};

export default CustodianAmountsPage;