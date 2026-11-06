"use client";

import { UserRoleManager } from "@/components/admin/UserRoleManager";
import { DashboardShell } from "@/components/DashboardShell";
import { systemAdminNav } from "@/config/dashboardNav";

const SystemAdminUsersPage = () => {
  return (
    <DashboardShell
      roleName="System Administrator"
      nav={systemAdminNav}
      title="Users & Roles"
      subtitle="Manage platform users and their roles."
    >
      <UserRoleManager />
    </DashboardShell>
  );
};

export default SystemAdminUsersPage;
