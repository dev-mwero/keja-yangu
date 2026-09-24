"use client";

import { DashboardShell } from "@/components/DashboardShell";
import { CaretakerPrivilegesTable } from "@/components/team/CaretakerPrivilegesTable";
import { ownerNav } from "@/config/dashboardNav";

const OwnerTeamPage = () => {
  return (
    <DashboardShell
      roleName="Owner"
      nav={ownerNav}
      title="Team"
      subtitle="Manage what your caretakers can do across your portfolio."
    >
      <CaretakerPrivilegesTable />
    </DashboardShell>
  );
};

export default OwnerTeamPage;
