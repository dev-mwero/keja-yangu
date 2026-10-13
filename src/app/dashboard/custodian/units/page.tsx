"use client";

import { UnitsView } from "@/components/units/UnitsView";
import { custodianNav } from "@/config/dashboardNav";

const CustodianUnitsPage = () => {
  return <UnitsView nav={custodianNav} roleName="Custodian" />;
};

export default CustodianUnitsPage;
