"use client";

import { useMemo } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { InvoicesManager } from "@/components/invoices/InvoicesManager";
import { systemAdminNav as nav } from "@/config/dashboardNav";
import { useTenants } from "@/hooks/use-tenants";

const SystemAdminAccountingPage = () => {
  const { tenants } = useTenants();
  const tenantNames = useMemo(
    () => Object.fromEntries(tenants.map((t) => [t._id, t.name])),
    [tenants],
  );

  return (
    <DashboardShell
      roleName="System Admin"
      nav={nav}
      title="Accounting"
      subtitle="Platform-wide invoicing and rent collection."
    >
      <InvoicesManager
        nav={nav}
        roleName="System Admin"
        canManage
        isStaffScope
        tenantNames={tenantNames}
      />
    </DashboardShell>
  );
};

export default SystemAdminAccountingPage;
