"use client";

import { useParams } from "next/navigation";

import { PropertyStructureView } from "@/components/property/PropertyStructureView";
import { useCaretakerNav } from "@/hooks/use-caretaker-nav";

const CaretakerPropertyStructurePage = () => {
  const { id } = useParams<{ id: string }>();
  const nav = useCaretakerNav();
  return (
    <PropertyStructureView
      propertyId={id}
      nav={nav}
      roleName="Caretaker"
      backHref="/dashboard/caretaker/portfolio"
    />
  );
};

export default CaretakerPropertyStructurePage;
