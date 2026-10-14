"use client";

import { PropertyTypeManager } from "@/components/admin/PropertyTypeManager";
import { DashboardShell } from "@/components/DashboardShell";
import { systemAdminNav } from "@/config/dashboardNav";

const SystemAdminPropertyTypesPage = () => {
  return (
    <DashboardShell
      roleName="System Administrator"
      nav={systemAdminNav}
      title="Property Types"
      subtitle="Manage the platform-wide list of property types."
    >
      <PropertyTypeManager />
    </DashboardShell>
  );
};

export default SystemAdminPropertyTypesPage;
