"use client";

import { RecycleBinManager } from "@/components/admin/RecycleBinManager";
import { DashboardShell } from "@/components/DashboardShell";
import { systemAdminNav } from "@/config/dashboardNav";

const SystemAdminRecycleBinPage = () => {
  return (
    <DashboardShell
      roleName="System Administrator"
      nav={systemAdminNav}
      title="Recycle Bin"
      subtitle="Restore records that were deleted, or remove them permanently."
    >
      <RecycleBinManager />
    </DashboardShell>
  );
};

export default SystemAdminRecycleBinPage;
