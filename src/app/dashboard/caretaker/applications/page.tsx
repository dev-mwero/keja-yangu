"use client";

import { ApplicationsView } from "@/components/applications/ApplicationsView";
import { useCaretakerNav } from "@/hooks/use-caretaker-nav";

const CaretakerApplicationsPage = () => {
  const nav = useCaretakerNav();
  return <ApplicationsView nav={nav} roleName="Caretaker" />;
};

export default CaretakerApplicationsPage;
