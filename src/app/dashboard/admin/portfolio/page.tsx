"use client";

import { PortfolioView } from "@/components/property/PortfolioView";
import { adminNav } from "@/config/dashboardNav";

const AdminPortfolioPage = () => {
  return <PortfolioView nav={adminNav} roleName="Admin" />;
};

export default AdminPortfolioPage;
