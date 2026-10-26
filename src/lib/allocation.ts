import { Lease } from "@/models/Lease";
import { Property } from "@/models/Property";
import { Tenant } from "@/models/Tenant";
import { Unit } from "@/models/Unit";
import { User } from "@/models/User";

/**
 * The single writer for occupancy state. Every route that places a tenant into
 * a unit, moves them between units, or vacates them calls this module — nothing
 * else may mutate `Unit.tenantId` / `Unit.status` (between available↔occupied)
 * or create/end an active `Lease`.
 *
 * `Lease.unitId` is authoritative (D2 Option A); `Unit.tenantId`/`status` are a
 * derived cache kept in sync here.
 */

/**
 * Domain error for allocation operations. Carries the HTTP status the calling
 * route should surface so route handlers can stay thin.
 */
export class AllocationError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AllocationError";
    this.status = status;
  }
}

export interface TenantRef {
  _id: unknown;
  email: string;
  userId?: string;
  propertyId: string;
  ownerId: string;
  status: string;
}

export interface AllocatedUnit {
  _id: unknown;
  propertyId: string;
  ownerId: string;
  name: string;
  blockName: string;
  status: string;
  /** Array of occupant user ids (matches Unit.tenantId schema). */
  tenantId: string[];
}

/**
 * Resolve the occupant user id for a tenant record, healing the link by email
 * for tenancies created before the `userId` bind existed. Returns "" when no
 * active account matches, which callers treat as "not assignable".
 */
export async function resolveOccupantUserId(tenant: {
  _id: unknown;
  email: string;
  userId?: string;
}): Promise<string> {
  if (tenant.userId) return tenant.userId;

  const user = await User.findOne({ email: tenant.email.trim().toLowerCase(), role: "tenant" })
    .select("_id isActive")
    .lean();
  if (!user || user.isActive === false) return "";

  const userId = String(user._id);
  await Tenant.updateOne({ _id: tenant._id }, { $set: { userId } });
  return userId;
}

export interface AllocateUnitInput {
  tenantId: string;
  unitId: string;
  rentAmount?: number;
  startDate?: Date;
  frequency?: "monthly";
  notes?: string;
}

/**
 * Place a tenant into a vacant unit: claim the unit atomically, bind the tenant,
 * open/refresh the active lease. Multi-unit tenancy is supported — the tenant
 * id is pushed into the array rather than overwriting it. Throws
 * `AllocationError` (404/409/422) when the unit is not assignable.
 *
 * Steps 5–7 run sequentially with compensation: if persisting the lease fails
 * after the claim, the unit is released so an occupied unit never exists without
 * a lease. (A session-based transaction is the deployed-target upgrade; this
 * fallback is the locally testable path.)
 */
export async function allocateUnit(
  input: AllocateUnitInput,
): Promise<{ unit: AllocatedUnit; tenant: TenantRef; lease: unknown }> {
  const tenant = (await Tenant.findById(input.tenantId).lean()) as TenantRef | null;
  if (!tenant) throw new AllocationError(404, "Tenant not found");

  const unit = await Unit.findById(input.unitId).lean();
  if (!unit) throw new AllocationError(404, "Unit not found");

  if (String(unit.propertyId) !== String(tenant.propertyId)) {
    throw new AllocationError(422, "That unit is not at this tenant's property");
  }

  const occupantUserId = await resolveOccupantUserId(tenant);
  if (!occupantUserId) {
    throw new AllocationError(
      409,
      "This tenant has no linked account yet. Ask them to sign up with this email first.",
    );
  }

  // Atomic claim: only a currently-vacant unit can be occupied, so two
  // concurrent allocations cannot both win the same unit.
  const claimed = (await Unit.findOneAndUpdate(
    { _id: input.unitId, status: "available", deletedAt: null },
    { $addToSet: { tenantId: occupantUserId }, $set: { status: "occupied" } },
    { new: true },
  ).lean()) as AllocatedUnit | null;
  if (!claimed) {
    throw new AllocationError(409, "That unit is no longer vacant");
  }

  try {
    const tenantSet: Record<string, unknown> = { userId: occupantUserId, status: "active" };
    if (tenant.status !== "active") tenantSet.joinedAt = new Date();
    await Tenant.updateOne({ _id: tenant._id }, { $set: tenantSet });

    // Upsert the active lease: keep billing terms, point it at the new unit.
    const existingLease = await Lease.findOne({
      tenantId: String(tenant._id),
      status: "active",
    }).lean();
    let lease: unknown;
    if (existingLease) {
      await Lease.updateOne({ _id: existingLease._id }, { $set: { unitId: String(claimed._id) } });
      lease = { ...existingLease, unitId: String(claimed._id) };
    } else {
      const property = await Property.findById(unit.propertyId).select("price").lean();
      lease = await Lease.create({
        tenantId: String(tenant._id),
        propertyId: String(unit.propertyId),
        ownerId: String(tenant.ownerId),
        unitId: String(claimed._id),
        rentAmount: input.rentAmount ?? unit.rent ?? property?.price ?? 0,
        frequency: input.frequency ?? "monthly",
        startDate: input.startDate ?? new Date(),
        status: "active",
        notes: input.notes,
      });
    }

    const updatedTenant = (await Tenant.findById(tenant._id).lean()) as TenantRef;
    return { unit: claimed, tenant: updatedTenant, lease };
  } catch (error) {
    // Compensate: a failed lease/bind must not leave the unit occupied.
    await Unit.updateOne(
      { _id: claimed._id, status: "occupied" },
      { $pull: { tenantId: occupantUserId }, $set: { status: "available" } },
    );
    throw error;
  }
}

/**
 * Free the unit a tenant currently occupies and end their active lease. The
 * tenant record itself is kept (property membership is not revoked).
 *
 * Throws `AllocationError` (404) when the tenant is not assigned to a unit.
 */
export async function vacateUnit(input: { tenantId: string }): Promise<{ tenant: TenantRef }> {
  const tenant = (await Tenant.findById(input.tenantId).lean()) as TenantRef | null;
  if (!tenant) throw new AllocationError(404, "Tenant not found");

  const occupantUserId = await resolveOccupantUserId(tenant);

  // Find a unit occupied by this user (array contains their userId).
  let unit = occupantUserId
    ? await Unit.findOne({
        tenantId: occupantUserId,
        propertyId: tenant.propertyId,
        status: "occupied",
      })
    : null;

  // Fall back to a unit containing the tenant record id (legacy / phone-only data).
  if (!unit) {
    unit = await Unit.findOne({ tenantId: String(tenant._id), propertyId: tenant.propertyId });
  }
  if (!unit) {
    throw new AllocationError(404, "This tenant is not assigned to a unit");
  }

  // Pull the occupant from the array; mark vacant only when no occupants remain.
  const occupantIds: string[] = Array.isArray(unit.tenantId)
    ? (unit.tenantId as string[])
    : unit.tenantId
      ? [String(unit.tenantId)]
      : [];
  const vacatingId =
    occupantUserId && occupantIds.includes(occupantUserId) ? occupantUserId : String(tenant._id);
  const remaining = occupantIds.filter((id) => id !== vacatingId);
  await Unit.updateOne(
    { _id: unit._id },
    remaining.length === 0
      ? { $pull: { tenantId: vacatingId }, $set: { status: "available" } }
      : { $pull: { tenantId: vacatingId } },
  );

  await Lease.updateMany(
    { tenantId: String(tenant._id), status: "active" },
    { $set: { status: "ended", endDate: new Date() } },
  );

  const updatedTenant = (await Tenant.findById(tenant._id).lean()) as TenantRef;
  return { tenant: updatedTenant };
}
