"use client";

import { useMemo } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { InvoicesManager } from "@/components/invoices/InvoicesManager";
import { adminNav as nav } from "@/config/dashboardNav";
import { useTenants } from "@/hooks/use-tenants";

const AdminAccountingPage = () => {
  const { tenants } = useTenants();
  const tenantNames = useMemo(
    () => Object.fromEntries(tenants.map((t) => [t._id, t.name])),
    [tenants],
  );

  return (
    <DashboardShell
      roleName="Admin"
      nav={nav}
      title="Accounting"
      subtitle="Revenue across your entire portfolio."
    >
      <InvoicesManager
        nav={nav}
        roleName="Admin"
        canManage
        isStaffScope
        tenantNames={tenantNames}
      />
    </DashboardShell>
  );
};

export default AdminAccountingPage;
