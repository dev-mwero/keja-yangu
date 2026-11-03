"use client";

import { UnitsView } from "@/components/units/UnitsView";
import { adminNav } from "@/config/dashboardNav";

const AdminUnitsPage = () => {
  return <UnitsView nav={adminNav} roleName="Admin" />;
};

export default AdminUnitsPage;
