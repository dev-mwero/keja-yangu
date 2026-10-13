"use client";

import { Building2, DoorOpen, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { custodianNav as nav } from "@/config/dashboardNav";
import { useProperties } from "@/hooks/use-properties";
import { useUnits } from "@/hooks/use-units";

const CustodianDashboard = () => {
  const { properties, loading } = useProperties();
  const { units, loading: unitsLoading } = useUnits();

  const occupied = units.filter((u) => u.status === "occupied").length;
  const occupancy = units.length > 0 ? Math.round((occupied / units.length) * 100) : 0;

  return (
    <DashboardShell
      roleName="Custodian"
      nav={nav}
      title="Custodian overview"
      subtitle="Manage the owner's portfolio on their behalf."
    >
      <div className="mb-6 flex justify-end">
        <Button asChild className="rounded-full">
          <Link href="/dashboard/custodian/portfolio">Manage portfolio</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Properties"
          value={loading ? "..." : properties.length}
          icon={Building2}
          href="/dashboard/custodian/portfolio"
        />
        <StatCard
          label="Units"
          value={unitsLoading ? "..." : units.length}
          icon={DoorOpen}
          href="/dashboard/custodian/units"
        />
        <StatCard
          label="Occupied units"
          value={unitsLoading ? "..." : occupied}
          icon={Users}
          href="/dashboard/custodian/units"
        />
        <StatCard
          label="Occupancy"
          value={unitsLoading ? "..." : `${occupancy}%`}
          icon={TrendingUp}
          href="/dashboard/custodian/units"
        />
      </div>
    </DashboardShell>
  );
};

export default CustodianDashboard;
