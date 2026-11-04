"use client";

import { CommissionManager } from "@/components/admin/CommissionManager";
import { DashboardShell } from "@/components/DashboardShell";
import { adminNav } from "@/config/dashboardNav";

export default function AdminCommissionsPage() {
  return (
    <DashboardShell
      roleName="Administrator"
      nav={adminNav}
      title="Commissions"
      subtitle="Review and approve commission accruals for properties you manage. Payout execution is reserved for system administrators."
    >
      <CommissionManager canManagePayouts={false} />
    </DashboardShell>
  );
}
