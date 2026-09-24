"use client";

import { TenantsManager } from "@/components/tenants/TenantsManager";
import { ownerNav } from "@/config/dashboardNav";

const OwnerTenantsPage = () => {
  return <TenantsManager nav={ownerNav} roleName="Owner" canSetStatus />;
};

export default OwnerTenantsPage;
