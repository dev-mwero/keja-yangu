"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";

const roleMap: Record<string, string[]> = {
  "/dashboard/owner": ["owner"],
  "/dashboard/tenant": ["tenant"],
  "/dashboard/caretaker": ["caretaker"],
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const allowedRoles = roleMap[pathname];

  return <AuthGuard allowedRoles={allowedRoles}>{children}</AuthGuard>;
}
