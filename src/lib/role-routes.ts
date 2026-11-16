export type Role = "tenant" | "caretaker" | "custodian" | "admin" | "broker" | "system-admin";

export const roleRoute: Record<Role, string> = {
  tenant: "/dashboard/tenant",
  caretaker: "/dashboard/caretaker",
  custodian: "/dashboard/custodian",
  admin: "/dashboard/admin",
  broker: "/dashboard/broker",
  "system-admin": "/dashboard/system-admin",
};

export const getRoleRoute = (role: Role): string => roleRoute[role] ?? "/dashboard";

const dashboardRoles: Array<[string, Role[]]> = [
  ["/dashboard/admin", ["admin", "system-admin"]],
  ["/dashboard/custodian", ["custodian", "admin", "system-admin"]],
  ["/dashboard/broker", ["broker", "system-admin"]],
  ["/dashboard/tenant", ["tenant"]],
  ["/dashboard/caretaker", ["caretaker", "system-admin"]],
  ["/dashboard/system-admin", ["system-admin"]],
];

/**
 * Returns the roles allowed to render a dashboard route, matching the full
 * prefix so nested paths (e.g. `/dashboard/admin/portfolio/123`) cannot fall
 * through to an unrestricted guard.
 */
export const getDashboardAllowedRoles = (pathname: string): Role[] | undefined => {
  for (const [prefix, roles] of dashboardRoles) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return roles;
  }
  return undefined;
};
