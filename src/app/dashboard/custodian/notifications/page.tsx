"use client";

import { DashboardShell } from "@/components/DashboardShell";
import { NotificationsList } from "@/components/notifications/NotificationsList";
import { custodianNav } from "@/config/dashboardNav";

const CustodianNotificationsPage = () => (
  <DashboardShell
    roleName="Custodian"
    nav={custodianNav}
    title="Notifications"
    subtitle="Your in-app notifications — payments, leases, complaints, and more."
  >
    <NotificationsList />
  </DashboardShell>
);

export default CustodianNotificationsPage;
