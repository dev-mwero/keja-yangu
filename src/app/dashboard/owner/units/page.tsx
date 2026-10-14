"use client";

import { UnitsView } from "@/components/units/UnitsView";
import { ownerNav } from "@/config/dashboardNav";

const OwnerUnitsPage = () => {
  return <UnitsView nav={ownerNav} roleName="Owner" />;
};

export default OwnerUnitsPage;
