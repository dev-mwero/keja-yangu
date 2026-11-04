"use client";

import { DashboardShell } from "@/components/DashboardShell";
import { NotificationsList } from "@/components/notifications/NotificationsList";
import { tenantNav } from "@/config/dashboardNav";

const TenantNotificationsPage = () => (
  <DashboardShell
    roleName="Tenant"
    nav={tenantNav}
    title="Notifications"
    subtitle="Your in-app notifications — payments, leases, complaints, and more."
  >
    <NotificationsList />
  </DashboardShell>
);

export default TenantNotificationsPage;
