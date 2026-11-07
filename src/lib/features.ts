/**
 * Feature flags.
 *
 * Flags default to "off" so a deployment never exposes a new privileged surface
 * until it is explicitly enabled.
 */

/** Enables the system-admin users/roles management surface. */
export function isRoleManagementEnabled(): boolean {
  return (process.env.ROLE_MANAGEMENT_ENABLED ?? "false").toLowerCase() === "true";
}
