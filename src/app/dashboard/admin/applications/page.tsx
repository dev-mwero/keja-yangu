"use client";

import { ApplicationsView } from "@/components/applications/ApplicationsView";
import { adminNav } from "@/config/dashboardNav";

const AdminApplicationsPage = () => {
  return <ApplicationsView nav={adminNav} roleName="Admin" />;
};

export default AdminApplicationsPage;
