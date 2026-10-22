export type Role = "tenant" | "caretaker" | "custodian" | "owner" | "system-admin";

export const roleRoute: Record<Role, string> = {
  tenant: "/dashboard/tenant",
  caretaker: "/dashboard/caretaker",
  custodian: "/dashboard/custodian",
  owner: "/dashboard/owner",
  "system-admin": "/dashboard/system-admin",
};

export const getRoleRoute = (role: Role): string => roleRoute[role] ?? "/dashboard";
