"use client";

import { useParams } from "next/navigation";

import { PropertyStructureView } from "@/components/property/PropertyStructureView";
import { adminNav } from "@/config/dashboardNav";

const AdminPropertyStructurePage = () => {
  const { id } = useParams<{ id: string }>();
  return (
    <PropertyStructureView
      propertyId={id}
      nav={adminNav}
      roleName="Admin"
      backHref="/dashboard/admin/portfolio"
    />
  );
};

export default AdminPropertyStructurePage;
