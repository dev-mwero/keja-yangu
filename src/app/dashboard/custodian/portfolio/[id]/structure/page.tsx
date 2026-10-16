"use client";

import { useParams } from "next/navigation";

import { PropertyStructureView } from "@/components/property/PropertyStructureView";
import { custodianNav } from "@/config/dashboardNav";

const CustodianPropertyStructurePage = () => {
  const { id } = useParams<{ id: string }>();
  return (
    <PropertyStructureView
      propertyId={id}
      nav={custodianNav}
      roleName="Custodian"
      backHref="/dashboard/custodian/portfolio"
    />
  );
};

export default CustodianPropertyStructurePage;
