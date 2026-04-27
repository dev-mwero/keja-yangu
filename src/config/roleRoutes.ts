export type Role = "tenant" | "caretaker" | "owner";

/**
 * Single source of truth for role-based dashboard routes.
 *
 * - `roleRoute`: the default landing route for each role after sign in.
 * - `allowedRoutesByRole`: every route prefix a given role is allowed to access.
 *   A stored "return to" path is considered valid when it exactly matches an
 *   allowed route or is a sub-path of one (e.g. `/dashboard/owner/units/123`).
 *
 * Reused by `ProtectedRoute` and `Auth` to prevent mismatches.
 */
export const roleRoute: Record<Role, string> = {
  tenant: "/dashboard/tenant",
  caretaker: "/dashboard/caretaker",
  owner: "/dashboard/owner",
};

export const allowedRoutesByRole: Record<Role, string[]> = {
  tenant: [roleRoute.tenant],
  caretaker: [roleRoute.caretaker],
  owner: [roleRoute.owner],
};

export const isRouteAllowedForRole = (route: string, role: Role): boolean => {
  const allowedRoutes = allowedRoutesByRole[role];
  return allowedRoutes.some(
    (allowed) => route === allowed || route.startsWith(`${allowed}/`),
  );
};