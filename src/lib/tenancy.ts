import { Lease } from "@/models/Lease";
import { Property } from "@/models/Property";
import { Tenant } from "@/models/Tenant";
import { Unit } from "@/models/Unit";
import { User } from "@/models/User";

/**
 * Domain error for tenancy operations. Carries the HTTP status the calling
 * route should surface so route handlers can stay thin.
 */
export class TenancyError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "TenancyError";
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

export interface AssignedUnit {
  _id: string;
  propertyId: string;
  ownerId: string;
  name: string;
  blockName: string;
  status: string;
  tenantId: string;
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

/**
 * Place a tenant into a vacant unit: claim the unit atomically, bind the tenant
 * to it, and open an active lease. Mirrors the effects of approving a move-in.
 *
 * Throws `TenancyError` (404/409/422) when the unit is not assignable.
 */
export async function assignUnitToTenant(opts: {
  tenant: TenantRef;
  unitId: string;
}): Promise<{ unit: AssignedUnit; tenant: TenantRef }> {
  const { tenant, unitId } = opts;

  const unit = await Unit.findById(unitId).lean();
  if (!unit) throw new TenancyError(404, "Unit not found");

  if (String(unit.propertyId) !== String(tenant.propertyId)) {
    throw new TenancyError(422, "That unit is not at this tenant's property");
  }

  const occupantUserId = await resolveOccupantUserId(tenant);
  if (!occupantUserId) {
    throw new TenancyError(
      409,
      "This tenant has no linked account yet. Ask them to sign up with this email first.",
    );
  }

  // Atomic claim: only a currently-vacant unit can be occupied, so two
  // concurrent assignments cannot both win the same unit.
  const claimed = await Unit.findOneAndUpdate(
    { _id: unitId, status: "available", deletedAt: null },
    { $set: { tenantId: occupantUserId, status: "occupied" } },
    { new: true },
  ).lean();
  if (!claimed) {
    throw new TenancyError(409, "That unit is no longer vacant");
  }

  const tenantSet: Record<string, unknown> = { userId: occupantUserId, status: "active" };
  if (tenant.status !== "active") tenantSet.joinedAt = new Date();
  await Tenant.updateOne({ _id: tenant._id }, { $set: tenantSet });

  const existingLease = await Lease.findOne({
    tenantId: String(tenant._id),
    status: "active",
  }).lean();
  if (!existingLease) {
    const property = await Property.findById(unit.propertyId).select("price").lean();
    await Lease.create({
      tenantId: String(tenant._id),
      propertyId: String(unit.propertyId),
      ownerId: String(tenant.ownerId),
      rentAmount: unit.rent ?? property?.price ?? 0,
      frequency: "monthly",
      startDate: new Date(),
      status: "active",
    });
  }

  const updatedTenant = (await Tenant.findById(tenant._id).lean()) as TenantRef;
  return { unit: claimed as AssignedUnit, tenant: updatedTenant };
}

/**
 * Free the unit a tenant currently occupies and end their active lease. The
 * tenant record itself is kept (property membership is not revoked).
 *
 * Throws `TenancyError` (404) when the tenant is not assigned to a unit.
 */
export async function vacateTenantFromUnit(opts: {
  tenant: TenantRef;
}): Promise<{ tenant: TenantRef }> {
  const { tenant } = opts;

  const occupantUserId = await resolveOccupantUserId(tenant);

  let unit = occupantUserId
    ? await Unit.findOne({
        tenantId: occupantUserId,
        propertyId: tenant.propertyId,
        status: "occupied",
      })
    : null;

  // Fall back to a unit pointing at the tenant record id (legacy data).
  if (!unit) {
    unit = await Unit.findOne({ tenantId: String(tenant._id), propertyId: tenant.propertyId });
  }
  if (!unit) {
    throw new TenancyError(404, "This tenant is not assigned to a unit");
  }

  unit.tenantId = "";
  unit.status = "available";
  await unit.save();

  await Lease.updateMany(
    { tenantId: String(tenant._id), status: "active" },
    { $set: { status: "ended", endDate: new Date() } },
  );

  const updatedTenant = (await Tenant.findById(tenant._id).lean()) as TenantRef;
  return { tenant: updatedTenant };
}
