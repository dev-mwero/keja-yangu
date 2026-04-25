import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Role, useAuth } from "@/hooks/use-auth";

const roleRoute: Record<Role, string> = {
  tenant: "/dashboard/tenant",
  caretaker: "/dashboard/caretaker",
  owner: "/dashboard/owner",
};

const RETURN_TO_KEY = "keja-return-to";

interface Props {
  allow: Role;
  children: ReactNode;
}

export const ProtectedRoute = ({ allow, children }: Props) => {
  const { user, loading, refreshFailed } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }

  if (refreshFailed || !user) {
    // Persist the intended destination so we can redirect back after login,
    // even if the user navigates away from /auth and comes back via a link.
    const from = location.pathname + location.search;
    try {
      sessionStorage.setItem(RETURN_TO_KEY, from);
    } catch {
      /* ignore */
    }
    return <Navigate to="/auth" replace state={{ from }} />;
  }

  if (user.role !== allow) {
    return <Navigate to={roleRoute[user.role]} replace />;
  }

  return <>{children}</>;
};
