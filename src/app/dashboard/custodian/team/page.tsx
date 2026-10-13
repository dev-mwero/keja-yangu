"use client";

import { DashboardShell } from "@/components/DashboardShell";
import { CaretakerPrivilegesTable } from "@/components/team/CaretakerPrivilegesTable";
import { custodianNav } from "@/config/dashboardNav";

const CustodianTeamPage = () => {
  return (
    <DashboardShell
      roleName="Custodian"
      nav={custodianNav}
      title="Team"
      subtitle="Manage what caretakers can do across the portfolio."
    >
      <CaretakerPrivilegesTable />
    </DashboardShell>
  );
};

export default CustodianTeamPage;
