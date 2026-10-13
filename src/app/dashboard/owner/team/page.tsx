"use client";

import { DashboardShell } from "@/components/DashboardShell";
import { CaretakerPrivilegesTable } from "@/components/team/CaretakerPrivilegesTable";
import { CustodianManager } from "@/components/team/CustodianManager";
import { ownerNav } from "@/config/dashboardNav";

const OwnerTeamPage = () => {
  return (
    <DashboardShell
      roleName="Owner"
      nav={ownerNav}
      title="Team"
      subtitle="Manage your custodians and what your caretakers can do across your portfolio."
    >
      <div className="space-y-10">
        <CustodianManager />
        <div>
          <h3 className="mb-4 font-display text-lg">Caretaker privileges</h3>
          <CaretakerPrivilegesTable />
        </div>
      </div>
    </DashboardShell>
  );
};

export default OwnerTeamPage;
