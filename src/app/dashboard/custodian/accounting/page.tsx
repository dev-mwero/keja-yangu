"use client";

import { useMemo } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { InvoicesManager } from "@/components/invoices/InvoicesManager";
import { custodianNav as nav } from "@/config/dashboardNav";
import { useTenants } from "@/hooks/use-tenants";

const CustodianAccountingPage = () => {
  const { tenants } = useTenants();
  const tenantNames = useMemo(
    () => Object.fromEntries(tenants.map((t) => [t._id, t.name])),
    [tenants],
  );

  return (
    <DashboardShell
      roleName="Custodian"
      nav={nav}
      title="Accounting"
      subtitle="Rent collection for the portfolio you manage."
    >
      <InvoicesManager
        nav={nav}
        roleName="Custodian"
        canManage
        isStaffScope
        tenantNames={tenantNames}
      />
    </DashboardShell>
  );
};

export default CustodianAccountingPage;
