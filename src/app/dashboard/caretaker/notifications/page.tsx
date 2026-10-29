"use client";

import { DashboardShell } from "@/components/DashboardShell";
import { NotificationsList } from "@/components/notifications/NotificationsList";
import { caretakerNav } from "@/config/dashboardNav";

const CaretakerNotificationsPage = () => (
  <DashboardShell
    roleName="Caretaker"
    nav={caretakerNav}
    title="Notifications"
    subtitle="Your in-app notifications — payments, leases, complaints, and more."
  >
    <NotificationsList />
  </DashboardShell>
);

export default CaretakerNotificationsPage;
