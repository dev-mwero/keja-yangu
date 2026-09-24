"use client";

import { DashboardShell } from "@/components/DashboardShell";
import { CaretakerPrivilegesTable } from "@/components/team/CaretakerPrivilegesTable";
import { systemAdminNav } from "@/config/dashboardNav";

const SystemAdminCaretakersPage = () => {
  return (
    <DashboardShell
      roleName="System Administrator"
      nav={systemAdminNav}
      title="Caretakers"
      subtitle="Configure privileges for every caretaker on the platform."
    >
      <CaretakerPrivilegesTable />
    </DashboardShell>
  );
};

export default SystemAdminCaretakersPage;
