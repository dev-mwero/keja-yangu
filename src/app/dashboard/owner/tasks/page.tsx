"use client";

import { PlaceholderPage } from "@/components/PlaceholderPage";
import { ownerNav as nav } from "@/config/dashboardNav";

export default function TasksPage() {
  return (
    <PlaceholderPage roleName="Owner" nav={nav} title="Tasks & Maintenance" />
  );
}
