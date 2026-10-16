"use client";

import { ApplicationsView } from "@/components/applications/ApplicationsView";
import { custodianNav } from "@/config/dashboardNav";

const CustodianApplicationsPage = () => {
  return <ApplicationsView nav={custodianNav} roleName="Custodian" />;
};

export default CustodianApplicationsPage;
