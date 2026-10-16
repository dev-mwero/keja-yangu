"use client";

import { useParams } from "next/navigation";

import { PropertyStructureView } from "@/components/property/PropertyStructureView";
import { systemAdminNav } from "@/config/dashboardNav";

const SystemAdminPropertyStructurePage = () => {
  const { id } = useParams<{ id: string }>();
  return (
    <PropertyStructureView
      propertyId={id}
      nav={systemAdminNav}
      roleName="System Admin"
      backHref="/dashboard/system-admin/portfolio"
    />
  );
};

export default SystemAdminPropertyStructurePage;
