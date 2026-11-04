"use client";

import { DashboardShell } from "@/components/DashboardShell";
import { NotificationsList } from "@/components/notifications/NotificationsList";
import { systemAdminNav } from "@/config/dashboardNav";

const SystemAdminNotificationsPage = () => (
  <DashboardShell
    roleName="System admin"
    nav={systemAdminNav}
    title="Notifications"
    subtitle="Your in-app notifications — payments, leases, complaints, and more."
  >
    <NotificationsList />
  </DashboardShell>
);

export default SystemAdminNotificationsPage;
