import type { AllocatedUnit, TenantRef } from "@/lib/allocation";
import { allocateUnit, vacateUnit } from "@/lib/allocation";

/**
 * Legacy tenancy API. Kept as a thin façade over `lib/allocation.ts` so existing
 * callers and tests keep their signatures; all occupancy writes live in
 * allocation.ts.
 */

export type { TenantRef } from "@/lib/allocation";
export { AllocationError as TenancyError, resolveOccupantUserId } from "@/lib/allocation";

export type AssignedUnit = AllocatedUnit;

/**
 * Place a tenant into a vacant unit. Throws `TenancyError` (404/409/422) when
 * the unit is not assignable.
 */
export async function assignUnitToTenant(opts: {
  tenant: TenantRef;
  unitId: string;
}): Promise<{ unit: AssignedUnit; tenant: TenantRef; lease: unknown }> {
  return allocateUnit({ tenantId: String(opts.tenant._id), unitId: opts.unitId });
}

/**
 * Free the unit a tenant currently occupies and end their active lease. Throws
 * `TenancyError` (404) when the tenant is not assigned to a unit.
 */
export async function vacateTenantFromUnit(opts: {
  tenant: TenantRef;
}): Promise<{ tenant: TenantRef }> {
  return vacateUnit({ tenantId: String(opts.tenant._id) });
}
