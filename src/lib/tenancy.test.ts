import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeObjectId, makeTenant, makeUnit } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));
vi.mock("@/models/Unit", () => ({ Unit: getModelStubs().unit }));
vi.mock("@/models/Lease", () => ({ Lease: getModelStubs().lease }));

import {
  assignUnitToTenant,
  resolveOccupantUserId,
  TenancyError,
  vacateTenantFromUnit,
} from "@/lib/tenancy";

const { user, property, tenant: tenantStub, unit: unitStub, lease } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const TENANT_ID = makeObjectId("tenant");
const UNIT_ID = makeObjectId("unit");
const PROPERTY_ID = makeObjectId("prop");
const OCCUPANT = makeObjectId("occupant");

beforeEach(() => {
  resetModelStubs();
});

describe("resolveOccupantUserId", () => {
  it("returns the bound userId without a lookup", async () => {
    const id = await resolveOccupantUserId({
      _id: TENANT_ID,
      email: "a@keja.co",
      userId: OCCUPANT,
    });
    expect(id).toBe(OCCUPANT);
    expect(user.findOne).not.toHaveBeenCalled();
  });

  it("heals the link by email for a legacy tenant", async () => {
    user.findOne.mockReturnValue(buildQuery({ _id: OCCUPANT, isActive: true }));
    tenantStub.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const id = await resolveOccupantUserId({ _id: TENANT_ID, email: "A@Keja.co", userId: "" });
    expect(id).toBe(OCCUPANT);
    expect(tenantStub.updateOne).toHaveBeenCalledWith(
      { _id: TENANT_ID },
      { $set: { userId: OCCUPANT } },
    );
  });

  it("returns empty when no active account matches", async () => {
    user.findOne.mockReturnValue(buildQuery({ _id: OCCUPANT, isActive: false }));
    const id = await resolveOccupantUserId({ _id: TENANT_ID, email: "a@keja.co", userId: "" });
    expect(id).toBe("");
  });
});

describe("assignUnitToTenant", () => {
  const tenant = makeTenant({
    _id: TENANT_ID,
    ownerId: OWNER_ID,
    propertyId: PROPERTY_ID,
    userId: OCCUPANT,
    status: "pending",
  });

  it("rejects a unit at a different property", async () => {
    unitStub.findById.mockReturnValue(buildQuery(makeUnit({ propertyId: makeObjectId("other") })));
    await expect(assignUnitToTenant({ tenant, unitId: UNIT_ID })).rejects.toMatchObject({
      status: 422,
    });
  });

  it("rejects when the unit was claimed concurrently", async () => {
    unitStub.findById.mockReturnValue(buildQuery(makeUnit({ propertyId: PROPERTY_ID })));
    unitStub.findOneAndUpdate.mockReturnValue(buildQuery(null));
    await expect(assignUnitToTenant({ tenant, unitId: UNIT_ID })).rejects.toBeInstanceOf(
      TenancyError,
    );
    expect(lease.create).not.toHaveBeenCalled();
  });

  it("claims the unit, activates the tenant, and opens a lease", async () => {
    unitStub.findById.mockReturnValue(buildQuery(makeUnit({ propertyId: PROPERTY_ID })));
    unitStub.findOneAndUpdate.mockReturnValue(
      buildQuery(makeUnit({ propertyId: PROPERTY_ID, status: "occupied", tenantId: OCCUPANT })),
    );
    tenantStub.updateOne.mockResolvedValue({ modifiedCount: 1 });
    tenantStub.findById.mockReturnValue(buildQuery({ ...tenant, status: "active" }));
    lease.findOne.mockReturnValue(buildQuery(null));
    lease.create.mockResolvedValue({ _id: makeObjectId("lease") });
    property.findById.mockReturnValue(buildQuery({ price: 45000 }));

    const result = await assignUnitToTenant({ tenant, unitId: UNIT_ID });

    expect(result.unit.status).toBe("occupied");
    expect(tenantStub.updateOne).toHaveBeenCalledWith(
      { _id: TENANT_ID },
      { $set: { userId: OCCUPANT, status: "active", joinedAt: expect.any(Date) } },
    );
    expect(lease.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        propertyId: PROPERTY_ID,
        status: "active",
      }),
    );
  });

  it("reuses an existing active lease instead of duplicating", async () => {
    unitStub.findById.mockReturnValue(buildQuery(makeUnit({ propertyId: PROPERTY_ID })));
    unitStub.findOneAndUpdate.mockReturnValue(
      buildQuery(makeUnit({ propertyId: PROPERTY_ID, status: "occupied", tenantId: OCCUPANT })),
    );
    tenantStub.updateOne.mockResolvedValue({ modifiedCount: 1 });
    tenantStub.findById.mockReturnValue(buildQuery(tenant));
    lease.findOne.mockReturnValue(buildQuery({ _id: makeObjectId("lease") }));

    await assignUnitToTenant({ tenant, unitId: UNIT_ID });
    expect(lease.create).not.toHaveBeenCalled();
  });
});

describe("vacateTenantFromUnit", () => {
  const tenant = makeTenant({
    _id: TENANT_ID,
    ownerId: OWNER_ID,
    propertyId: PROPERTY_ID,
    userId: OCCUPANT,
    status: "active",
  });

  it("frees the occupied unit and ends the lease", async () => {
    const occupied = {
      ...makeUnit({ propertyId: PROPERTY_ID, status: "occupied", tenantId: OCCUPANT }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    unitStub.findOne.mockResolvedValue(occupied);
    lease.updateMany.mockResolvedValue({ modifiedCount: 1 });
    tenantStub.findById.mockReturnValue(buildQuery(tenant));

    await vacateTenantFromUnit({ tenant });

    expect(occupied.status).toBe("available");
    expect(occupied.tenantId).toBe("");
    expect(lease.updateMany).toHaveBeenCalledWith(
      { tenantId: TENANT_ID, status: "active" },
      expect.objectContaining({ $set: expect.objectContaining({ status: "ended" }) }),
    );
  });

  it("404s when the tenant has no unit", async () => {
    unitStub.findOne.mockResolvedValue(null);
    await expect(vacateTenantFromUnit({ tenant })).rejects.toMatchObject({ status: 404 });
  });
});
