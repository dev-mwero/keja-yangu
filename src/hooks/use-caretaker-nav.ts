"use client";

import { caretakerNav, caretakerNavWithTenants } from "@/config/dashboardNav";
import { useAuth } from "@/hooks/use-auth";

export const useCaretakerNav = () => {
  const { user } = useAuth();
  return user?.privileges?.includes("manage_tenants") ? caretakerNavWithTenants : caretakerNav;
};
