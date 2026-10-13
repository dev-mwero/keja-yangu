"use client";

import { TenantsManager } from "@/components/tenants/TenantsManager";
import { custodianNav } from "@/config/dashboardNav";

const CustodianTenantsPage = () => {
  return <TenantsManager nav={custodianNav} roleName="Custodian" canSetStatus />;
};

export default CustodianTenantsPage;
