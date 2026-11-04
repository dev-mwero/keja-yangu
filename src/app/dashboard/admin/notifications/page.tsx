"use client";

import { DashboardShell } from "@/components/DashboardShell";
import { NotificationsList } from "@/components/notifications/NotificationsList";
import { adminNav } from "@/config/dashboardNav";

const AdminNotificationsPage = () => (
  <DashboardShell
    roleName="Admin"
    nav={adminNav}
    title="Notifications"
    subtitle="Your in-app notifications — payments, leases, complaints, and more."
  >
    <NotificationsList />
  </DashboardShell>
);

export default AdminNotificationsPage;
