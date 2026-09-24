"use client";

import { PortfolioView } from "@/components/property/PortfolioView";
import { ownerNav } from "@/config/dashboardNav";

const OwnerPortfolioPage = () => {
  return <PortfolioView nav={ownerNav} roleName="Owner" />;
};

export default OwnerPortfolioPage;
