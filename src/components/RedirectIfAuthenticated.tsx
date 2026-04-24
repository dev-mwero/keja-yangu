import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Role, useAuth } from "@/hooks/use-auth";

const roleRoute: Record<Role, string> = {
  tenant: "/dashboard/tenant",
  caretaker: "/dashboard/caretaker",
  owner: "/dashboard/owner",
};

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

export const RedirectIfAuthenticated = ({ children, fallback }: Props) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      fallback || (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      )
    );
  }

  if (user) {
    return <Navigate to={roleRoute[user.role]} replace />;
  }

  return <>{children}</>;
};
