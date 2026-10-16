"use client";

import { ApplicationsView } from "@/components/applications/ApplicationsView";
import { ownerNav } from "@/config/dashboardNav";

const OwnerApplicationsPage = () => {
  return <ApplicationsView nav={ownerNav} roleName="Owner" />;
};

export default OwnerApplicationsPage;
