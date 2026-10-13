"use client";

import { UnitsView } from "@/components/units/UnitsView";
import { caretakerNav } from "@/config/dashboardNav";

const CaretakerUnitsPage = () => {
  return <UnitsView nav={caretakerNav} roleName="Caretaker" />;
};

export default CaretakerUnitsPage;
