"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { getDashboardAllowedRoles } from "@/lib/role-routes";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const allowedRoles = getDashboardAllowedRoles(pathname);

  return <AuthGuard allowedRoles={allowedRoles}>{children}</AuthGuard>;
}
