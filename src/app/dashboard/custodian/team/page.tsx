"use client";

import { DashboardShell } from "@/components/DashboardShell";
import { CaretakerPrivilegesTable } from "@/components/team/CaretakerPrivilegesTable";
import { TeamInviteCard } from "@/components/team/TeamInviteCard";
import { custodianNav } from "@/config/dashboardNav";
import { useAuth } from "@/hooks/use-auth";

const CustodianTeamPage = () => {
  const { user } = useAuth();
  const canAssign =
    user?.role === "custodian" && (user.privileges ?? []).includes("assign_privileges");

  return (
    <DashboardShell
      roleName="Custodian"
      nav={custodianNav}
      title="Team"
      subtitle="Invite caretakers and, if you are a privileged custodian, control what they can do across your owner's portfolio."
    >
      <div className="space-y-10">
        <TeamInviteCard allowedRoles={["caretaker"]} />
        <CaretakerPrivilegesTable canAssign={canAssign} />
      </div>
    </DashboardShell>
  );
};

export default CustodianTeamPage;
