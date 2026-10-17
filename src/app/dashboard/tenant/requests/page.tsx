"use client";

import { useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { TenantApplicationsPanel } from "@/components/tenant/TenantApplicationsPanel";
import { TenantMoveRequestsPanel } from "@/components/tenant/TenantMoveRequestsPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { tenantNav } from "@/config/dashboardNav";

type Tab = "applications" | "move-requests";

const TenantRequestsPage = () => {
  const [tab, setTab] = useState<Tab>("applications");

  return (
    <DashboardShell
      roleName="Tenant"
      nav={tenantNav}
      title="Requests"
      subtitle="Your applications to homes and your move requests."
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="applications">Applications</TabsTrigger>
          <TabsTrigger value="move-requests">Move requests</TabsTrigger>
        </TabsList>
        <TabsContent value="applications" className="mt-6">
          <TenantApplicationsPanel />
        </TabsContent>
        <TabsContent value="move-requests" className="mt-6">
          <TenantMoveRequestsPanel />
        </TabsContent>
      </Tabs>
    </DashboardShell>
  );
};

export default TenantRequestsPage;
