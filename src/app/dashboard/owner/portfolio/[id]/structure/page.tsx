"use client";

import { useParams } from "next/navigation";

import { PropertyStructureView } from "@/components/property/PropertyStructureView";
import { ownerNav } from "@/config/dashboardNav";

const OwnerPropertyStructurePage = () => {
  const { id } = useParams<{ id: string }>();
  return (
    <PropertyStructureView
      propertyId={id}
      nav={ownerNav}
      roleName="Owner"
      backHref="/dashboard/owner/portfolio"
    />
  );
};

export default OwnerPropertyStructurePage;
