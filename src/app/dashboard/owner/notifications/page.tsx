"use client";

import { DashboardShell } from "@/components/DashboardShell";
import { NotificationsList } from "@/components/notifications/NotificationsList";
import { ownerNav } from "@/config/dashboardNav";

const OwnerNotificationsPage = () => (
  <DashboardShell
    roleName="Owner"
    nav={ownerNav}
    title="Notifications"
    subtitle="Your in-app notifications — payments, leases, complaints, and more."
  >
    <NotificationsList />
  </DashboardShell>
);

export default OwnerNotificationsPage;
