"use client";

import { PortfolioView } from "@/components/property/PortfolioView";
import { custodianNav } from "@/config/dashboardNav";

const CustodianPortfolioPage = () => {
  return <PortfolioView nav={custodianNav} roleName="Custodian" />;
};

export default CustodianPortfolioPage;
