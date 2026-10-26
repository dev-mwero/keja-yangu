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

import { AllocationError, allocateUnit, vacateUnit } from "@/lib/allocation";

const { user, property, tenant: tenantStub, unit: unitStub, lease } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const TENANT_ID = makeObjectId("tenant");
const UNIT_ID = makeObjectId("unit");
const PROPERTY_ID = makeObjectId("prop");
const OCCUPANT = makeObjectId("occupant");

beforeEach(() => {
  resetModelStubs();
});

describe("allocateUnit", () => {
  const tenant = makeTenant({
    _id: TENANT_ID,
    ownerId: OWNER_ID,
    propertyId: PROPERTY_ID,
    userId: OCCUPANT,
    status: "pending",
    email: "t@keja.co",
  });

  it("allocates successfully and creates lease with unitId", async () => {
    tenantStub.findById.mockReturnValue(buildQuery(tenant));
    unitStub.findById.mockReturnValue(
      buildQuery(makeUnit({ propertyId: PROPERTY_ID, rent: 30000 })),
    );
    unitStub.findOneAndUpdate.mockReturnValue(
      buildQuery(
        makeUnit({
          _id: UNIT_ID,
          propertyId: PROPERTY_ID,
          status: "occupied",
          tenantId: [OCCUPANT],
        }),
      ),
    );
    tenantStub.updateOne.mockResolvedValue({ modifiedCount: 1 });
    tenantStub.findById.mockReturnValue(buildQuery({ ...tenant, status: "active" }));
    lease.findOne.mockReturnValue(buildQuery(null));
    lease.create.mockResolvedValue({ _id: makeObjectId("lease") });
    property.findById.mockReturnValue(buildQuery({ price: 45000 }));

    const result = await allocateUnit({ tenantId: String(TENANT_ID), unitId: String(UNIT_ID) });

    expect(result.unit.status).toBe("occupied");
    expect(unitStub.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: String(UNIT_ID), status: "available", deletedAt: null },
      { $addToSet: { tenantId: OCCUPANT }, $set: { status: "occupied" } },
      { new: true },
    );
    expect(lease.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        propertyId: PROPERTY_ID,
        ownerId: OWNER_ID,
        unitId: String(UNIT_ID),
        status: "active",
      }),
    );
  });

  it("throws 409 when unit claimed concurrently", async () => {
    tenantStub.findById.mockReturnValue(buildQuery(tenant));
    unitStub.findById.mockReturnValue(buildQuery(makeUnit({ propertyId: PROPERTY_ID })));
    unitStub.findOneAndUpdate.mockReturnValue(buildQuery(null));

    await expect(
      allocateUnit({ tenantId: String(TENANT_ID), unitId: String(UNIT_ID) }),
    ).rejects.toBeInstanceOf(AllocationError);
  });

  it("throws 422 for wrong property", async () => {
    tenantStub.findById.mockReturnValue(buildQuery(tenant));
    unitStub.findById.mockReturnValue(buildQuery(makeUnit({ propertyId: makeObjectId("other") })));

    await expect(
      allocateUnit({ tenantId: String(TENANT_ID), unitId: String(UNIT_ID) }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("throws 409 for unlinked tenant", async () => {
    tenantStub.findById.mockReturnValue(buildQuery({ ...tenant, userId: "" }));
    unitStub.findById.mockReturnValue(buildQuery(makeUnit({ propertyId: PROPERTY_ID })));
    user.findOne.mockReturnValue(buildQuery(null));

    await expect(
      allocateUnit({ tenantId: String(TENANT_ID), unitId: String(UNIT_ID) }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("upserts lease when existing active lease exists", async () => {
    tenantStub.findById.mockReturnValue(buildQuery(tenant));
    unitStub.findById.mockReturnValue(buildQuery(makeUnit({ propertyId: PROPERTY_ID })));
    unitStub.findOneAndUpdate.mockReturnValue(
      buildQuery(
        makeUnit({
          _id: UNIT_ID,
          propertyId: PROPERTY_ID,
          status: "occupied",
          tenantId: [OCCUPANT],
        }),
      ),
    );
    tenantStub.updateOne.mockResolvedValue({ modifiedCount: 1 });
    tenantStub.findById.mockReturnValue(buildQuery(tenant));
    lease.findOne.mockReturnValue(buildQuery({ _id: makeObjectId("lease") }));
    lease.updateOne.mockResolvedValue({ modifiedCount: 1 });

    await allocateUnit({ tenantId: String(TENANT_ID), unitId: String(UNIT_ID) });
    expect(lease.create).not.toHaveBeenCalled();
    expect(lease.updateOne).toHaveBeenCalledWith(
      { _id: expect.anything() },
      { $set: { unitId: String(UNIT_ID) } },
    );
  });

  it("only one of two concurrent allocations of the same unit wins", async () => {
    tenantStub.findById.mockReturnValue(buildQuery(tenant));
    unitStub.findById.mockReturnValue(buildQuery(makeUnit({ propertyId: PROPERTY_ID })));
    unitStub.findOneAndUpdate
      .mockReturnValueOnce(
        buildQuery(
          makeUnit({
            _id: UNIT_ID,
            propertyId: PROPERTY_ID,
            status: "occupied",
            tenantId: [OCCUPANT],
          }),
        ),
      )
      .mockReturnValueOnce(buildQuery(null));
    tenantStub.updateOne.mockResolvedValue({ modifiedCount: 1 });
    tenantStub.findById.mockReturnValue(buildQuery(tenant));
    lease.findOne.mockReturnValue(buildQuery(null));
    lease.create.mockResolvedValue({ _id: makeObjectId("lease") });
    property.findById.mockReturnValue(buildQuery({ price: 45000 }));

    const first = await allocateUnit({ tenantId: String(TENANT_ID), unitId: String(UNIT_ID) });
    expect(first.unit.status).toBe("occupied");

    await expect(
      allocateUnit({ tenantId: String(TENANT_ID), unitId: String(UNIT_ID) }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("releases the unit when the lease write fails after the claim", async () => {
    tenantStub.findById.mockReturnValue(buildQuery(tenant));
    unitStub.findById.mockReturnValue(buildQuery(makeUnit({ propertyId: PROPERTY_ID })));
    unitStub.findOneAndUpdate.mockReturnValue(
      buildQuery(
        makeUnit({
          _id: UNIT_ID,
          propertyId: PROPERTY_ID,
          status: "occupied",
          tenantId: [OCCUPANT],
        }),
      ),
    );
    tenantStub.updateOne.mockResolvedValue({ modifiedCount: 1 });
    tenantStub.findById.mockReturnValue(buildQuery(tenant));
    lease.findOne.mockReturnValue(buildQuery(null));
    lease.create.mockRejectedValue(new Error("lease write failed"));
    property.findById.mockReturnValue(buildQuery({ price: 45000 }));

    await expect(
      allocateUnit({ tenantId: String(TENANT_ID), unitId: String(UNIT_ID) }),
    ).rejects.toThrow("lease write failed");
    // Compensation: pull the occupant and mark vacant
    expect(unitStub.updateOne).toHaveBeenCalledWith(
      { _id: UNIT_ID, status: "occupied" },
      { $pull: { tenantId: OCCUPANT }, $set: { status: "available" } },
    );
  });
});

describe("vacateUnit", () => {
  const tenant = makeTenant({
    _id: TENANT_ID,
    ownerId: OWNER_ID,
    propertyId: PROPERTY_ID,
    userId: OCCUPANT,
    status: "active",
  });

  it("frees unit and ends lease", async () => {
    tenantStub.findById.mockReturnValue(buildQuery(tenant));
    unitStub.findOne.mockResolvedValue({
      _id: UNIT_ID,
      propertyId: PROPERTY_ID,
      status: "occupied",
      tenantId: [OCCUPANT],
    });
    unitStub.updateOne.mockResolvedValue({ modifiedCount: 1 });
    lease.updateMany.mockResolvedValue({ modifiedCount: 1 });
    tenantStub.findById.mockReturnValue(buildQuery(tenant));

    await vacateUnit({ tenantId: String(TENANT_ID) });
    // Last occupant removed → mark available
    expect(unitStub.updateOne).toHaveBeenCalledWith(
      { _id: UNIT_ID },
      { $pull: { tenantId: OCCUPANT }, $set: { status: "available" } },
    );
  });

  it("404s when no unit assigned", async () => {
    tenantStub.findById.mockReturnValue(buildQuery(tenant));
    unitStub.findOne.mockResolvedValue(null);
    await expect(vacateUnit({ tenantId: String(TENANT_ID) })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("frees a legacy unit that points at the tenant doc id", async () => {
    tenantStub.findById.mockReturnValue(buildQuery(tenant));
    // First lookup (occupant userId) finds nothing; second (legacy) matches.
    unitStub.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
      _id: UNIT_ID,
      propertyId: PROPERTY_ID,
      status: "occupied",
      tenantId: [String(TENANT_ID)],
    });
    unitStub.updateOne.mockResolvedValue({ modifiedCount: 1 });
    lease.updateMany.mockResolvedValue({ modifiedCount: 1 });
    tenantStub.findById.mockReturnValue(buildQuery(tenant));

    await vacateUnit({ tenantId: String(TENANT_ID) });
    expect(unitStub.updateOne).toHaveBeenCalledWith(
      { _id: UNIT_ID },
      { $pull: { tenantId: String(TENANT_ID) }, $set: { status: "available" } },
    );
  });
});
