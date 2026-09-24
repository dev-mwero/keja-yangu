"use client";

import { useMemo } from "react";

import { TenantsManager } from "@/components/tenants/TenantsManager";
import { useAuth } from "@/hooks/use-auth";
import { useCaretakerNav } from "@/hooks/use-caretaker-nav";
import { useProperties } from "@/hooks/use-properties";

const CaretakerTenantsPage = () => {
  const nav = useCaretakerNav();
  const { user } = useAuth();
  const { properties } = useProperties();

  const allowedProperties = useMemo(
    () => properties.filter((p) => p.caretakerIds.includes(user?.id ?? "")).map((p) => p._id),
    [properties, user?.id],
  );

  return (
    <TenantsManager
      nav={nav}
      roleName="Caretaker"
      canSetStatus={false}
      allowedProperties={allowedProperties}
    />
  );
};

export default CaretakerTenantsPage;
