"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getRoleRoute } from "@/lib/role-routes";

export const AuthGuard = ({
  children,
  allowedRoles,
}: {
  children: ReactNode;
  allowedRoles?: string[];
}) => {
  const { user, loading } = useAuth();
  const router = useRouter();

  const isAllowed = Boolean(
    user &&
      allowedRoles &&
      (allowedRoles.includes(user.role) ||
        (user.role === "admin" && allowedRoles.includes("owner"))),
  );

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/auth");
      return;
    }
    if (!isAllowed) {
      router.push(getRoleRoute(user.role));
    }
  }, [user, loading, router, isAllowed]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user || !isAllowed) return null;

  return <>{children}</>;
};
