"use client";

"use client";

import { useState } from "react";
import { UserInviteCard } from "@/components/admin/UserInviteCard";
import { UserRoleManager } from "@/components/admin/UserRoleManager";
import { DashboardShell } from "@/components/DashboardShell";
import { systemAdminNav } from "@/config/dashboardNav";

const SystemAdminUsersPage = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <DashboardShell
      roleName="System Administrator"
      nav={systemAdminNav}
      title="Users & Roles"
      subtitle="Manage platform users and their roles."
    >
      <UserInviteCard onCreated={() => setRefreshKey((k) => k + 1)} />
      <UserRoleManager refreshKey={refreshKey} />
    </DashboardShell>
  );
};

export default SystemAdminUsersPage;
