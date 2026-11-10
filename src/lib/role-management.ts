import type { Role } from "@/lib/permissions";

/** Every role known to the platform. */
export const USER_ROLES = [
  "tenant",
  "caretaker",
  "custodian",
  "owner",
  "admin",
  "broker",
  "system-admin",
] as const satisfies readonly Role[];

export type UserRole = (typeof USER_ROLES)[number];

/**
 * Roles that may be assigned through the HTTP role-management surface.
 * `system-admin` is deliberately excluded: it is grantable/revocable only via
 * the audited CLI (`scripts/grant-system-admin.ts`).
 */
export const ASSIGNABLE_ROLES = [
  "tenant",
  "caretaker",
  "custodian",
  "admin",
  "broker",
] as const satisfies readonly Role[];

// `owner` is retained in USER_ROLES for backward compatibility with legacy
// accounts but is no longer assignable (Phase 9 retirement). Existing owner
// users keep their role; new assignments are blocked at the API boundary.

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

export function isAssignableRole(value: string): value is AssignableRole {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(value);
}
