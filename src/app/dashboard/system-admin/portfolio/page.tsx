"use client";

import { PortfolioView } from "@/components/property/PortfolioView";
import { systemAdminNav } from "@/config/dashboardNav";

const SystemAdminPortfolioPage = () => {
  return <PortfolioView nav={systemAdminNav} roleName="System Administrator" systemAdmin />;
};

export default SystemAdminPortfolioPage;
