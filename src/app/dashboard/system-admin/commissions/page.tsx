"use client";

import { CommissionManager } from "@/components/admin/CommissionManager";
import { DashboardShell } from "@/components/DashboardShell";
import { systemAdminNav } from "@/config/dashboardNav";

export default function SystemAdminCommissionsPage() {
  return (
    <DashboardShell
      roleName="System Administrator"
      nav={systemAdminNav}
      title="Commissions"
      subtitle="Review shadow accruals, approve payouts, and execute controlled broker settlements."
    >
      <CommissionManager />
    </DashboardShell>
  );
}
