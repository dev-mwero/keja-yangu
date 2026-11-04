"use client";

import { DashboardShell } from "@/components/DashboardShell";
import { TenantRequestsPanel } from "@/components/tenant/TenantRequestsPanel";
import { tenantNav } from "@/config/dashboardNav";

const TenantRequestsPage = () => (
  <DashboardShell
    roleName="Tenant"
    nav={tenantNav}
    title="Requests"
    subtitle="Everything you've asked your property manager for."
  >
    <TenantRequestsPanel />
  </DashboardShell>
);

export default TenantRequestsPage;
