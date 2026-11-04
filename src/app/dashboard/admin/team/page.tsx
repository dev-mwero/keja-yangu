"use client";

import { DashboardShell } from "@/components/DashboardShell";
import { CaretakerPrivilegesTable } from "@/components/team/CaretakerPrivilegesTable";
import { CustodianManager } from "@/components/team/CustodianManager";
import { TeamInviteCard } from "@/components/team/TeamInviteCard";
import { adminNav } from "@/config/dashboardNav";

const AdminTeamPage = () => {
  return (
    <DashboardShell
      roleName="Admin"
      nav={adminNav}
      title="Team"
      subtitle="Invite custodians and caretakers, assign privileges, and control what each team member can do."
    >
      <div className="space-y-10">
        <TeamInviteCard allowedRoles={["custodian", "caretaker"]} />
        <CustodianManager />
        <div>
          <h3 className="mb-4 font-display text-lg">Caretaker privileges</h3>
          <CaretakerPrivilegesTable canAssign />
        </div>
      </div>
    </DashboardShell>
  );
};

export default AdminTeamPage;
