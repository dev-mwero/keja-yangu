"use client";

import { TenantsManager } from "@/components/tenants/TenantsManager";
import { systemAdminNav } from "@/config/dashboardNav";

const SystemAdminTenantsPage = () => {
  return <TenantsManager nav={systemAdminNav} roleName="System Administrator" canSetStatus />;
};

export default SystemAdminTenantsPage;
