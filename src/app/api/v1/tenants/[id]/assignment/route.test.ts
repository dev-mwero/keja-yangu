/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeObjectId, makeTenant, makeUnit, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Tenant", () => ({
  Tenant: getModelStubs().tenant,
  TENANT_SAFE_FIELDS:
    "name email phone propertyId ownerId status joinedAt notes createdAt updatedAt",
}));
vi.mock("@/models/Unit", () => ({ Unit: getModelStubs().unit }));
vi.mock("@/models/Lease", () => ({ Lease: getModelStubs().lease }));

import { DELETE, POST } from "@/app/api/v1/tenants/[id]/assignment/route";

const { user, property, tenant: tenantStub, unit: unitStub, lease } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const OTHER_OWNER_ID = makeObjectId("other-owner");
const TENANT_ID = makeObjectId("tenant");
const UNIT_ID = makeObjectId("unit");
const PROPERTY_ID = makeObjectId("prop");
const OCCUPANT_USER_ID = makeObjectId("occupant");

function ownerDoc() {
  return makeUser({ _id: OWNER_ID, role: "owner" });
}

function tenantDoc(overrides: Record<string, unknown> = {}) {
  return makeTenant({
    _id: TENANT_ID,
    ownerId: OWNER_ID,
    propertyId: PROPERTY_ID,
    userId: OCCUPANT_USER_ID,
    ...overrides,
  });
}

function unitDoc(overrides: Record<string, unknown> = {}) {
  return makeUnit({
    _id: UNIT_ID,
    propertyId: PROPERTY_ID,
    ownerId: OWNER_ID,
    status: "available",
    tenantId: "",
    ...overrides,
  });
}

async function json(res: Response) {
  return (await res.json()) as { data?: Record<string, unknown>; error?: string };
}

function assignRequest() {
  return buildRequest(`/api/v1/tenants/${TENANT_ID}/assignment`, {
    method: "POST",
    token: signToken(OWNER_ID),
    body: { unitId: UNIT_ID },
  });
}

describe("POST /api/v1/tenants/[id]/assignment", () => {
  beforeEach(() => {
    resetModelStubs();
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    user.findOne.mockReturnValue(buildQuery(null));
  });

  it("401 when unauthenticated", async () => {
    const res = await POST(
      buildRequest(`/api/v1/tenants/${TENANT_ID}/assignment`, {
        method: "POST",
        body: { unitId: UNIT_ID },
      }),
      withParams(TENANT_ID),
    );
    expect(res.status).toBe(401);
  });

  it("404 when the tenant is outside the caller's scope", async () => {
    tenantStub.findById.mockReturnValue(buildQuery(tenantDoc({ ownerId: OTHER_OWNER_ID })));
    const res = await POST(assignRequest(), withParams(TENANT_ID));
    expect(res.status).toBe(404);
  });

  it("400 for an invalid unit id", async () => {
    tenantStub.findById.mockReturnValue(buildQuery(tenantDoc()));
    const res = await POST(
      buildRequest(`/api/v1/tenants/${TENANT_ID}/assignment`, {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { unitId: "not-an-id" },
      }),
      withParams(TENANT_ID),
    );
    expect(res.status).toBe(400);
  });

  it("assigns a vacant unit, occupies it, and opens a lease", async () => {
    tenantStub.findById.mockReturnValue(buildQuery(tenantDoc()));
    unitStub.findById.mockReturnValue(buildQuery(unitDoc()));
    unitStub.findOneAndUpdate.mockReturnValue(
      buildQuery(unitDoc({ status: "occupied", tenantId: OCCUPANT_USER_ID })),
    );
    tenantStub.updateOne.mockResolvedValue({ modifiedCount: 1 });
    lease.findOne.mockReturnValue(buildQuery(null));
    lease.create.mockResolvedValue({ _id: makeObjectId("lease") });
    property.findById.mockReturnValue(buildQuery({ price: 45000 }));

    const res = await POST(assignRequest(), withParams(TENANT_ID));

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data?.unit).toMatchObject({ _id: UNIT_ID, name: "3A" });
    expect(unitStub.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: UNIT_ID, status: "available", deletedAt: null },
      { $set: { tenantId: OCCUPANT_USER_ID, status: "occupied" } },
      { new: true },
    );
    expect(lease.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID, status: "active" }),
    );
  });

  it("409 when the unit is no longer vacant", async () => {
    tenantStub.findById.mockReturnValue(buildQuery(tenantDoc()));
    unitStub.findById.mockReturnValue(buildQuery(unitDoc()));
    unitStub.findOneAndUpdate.mockReturnValue(buildQuery(null));

    const res = await POST(assignRequest(), withParams(TENANT_ID));
    expect(res.status).toBe(409);
  });

  it("422 when the unit belongs to a different property", async () => {
    tenantStub.findById.mockReturnValue(buildQuery(tenantDoc()));
    unitStub.findById.mockReturnValue(
      buildQuery(unitDoc({ propertyId: makeObjectId("other-prop") })),
    );

    const res = await POST(assignRequest(), withParams(TENANT_ID));
    expect(res.status).toBe(422);
  });

  it("409 when the tenant has no linked account", async () => {
    tenantStub.findById.mockReturnValue(buildQuery(tenantDoc({ userId: "" })));
    unitStub.findById.mockReturnValue(buildQuery(unitDoc()));
    user.findOne.mockReturnValue(buildQuery(null));

    const res = await POST(assignRequest(), withParams(TENANT_ID));
    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/v1/tenants/[id]/assignment", () => {
  beforeEach(() => {
    resetModelStubs();
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    user.findOne.mockReturnValue(buildQuery(null));
  });

  it("vacates the tenant's unit and ends the lease", async () => {
    tenantStub.findById.mockReturnValue(buildQuery(tenantDoc()));
    const occupied = {
      ...unitDoc({ status: "occupied", tenantId: OCCUPANT_USER_ID }),
    };
    unitStub.findOne.mockResolvedValue(occupied);
    unitStub.updateOne.mockResolvedValue({ modifiedCount: 1 });
    lease.updateMany.mockResolvedValue({ modifiedCount: 1 });
    tenantStub.findById.mockReturnValue(buildQuery(tenantDoc()));

    const res = await DELETE(
      buildRequest(`/api/v1/tenants/${TENANT_ID}/assignment`, {
        method: "DELETE",
        token: signToken(OWNER_ID),
      }),
      withParams(TENANT_ID),
    );

    expect(res.status).toBe(200);
    expect(unitStub.updateOne).toHaveBeenCalled();
    expect(lease.updateMany).toHaveBeenCalledWith(
      { tenantId: TENANT_ID, status: "active" },
      expect.objectContaining({ $set: expect.objectContaining({ status: "ended" }) }),
    );
  });

  it("404 when the tenant occupies no unit", async () => {
    tenantStub.findById.mockReturnValue(buildQuery(tenantDoc()));
    unitStub.findOne.mockResolvedValue(null);

    const res = await DELETE(
      buildRequest(`/api/v1/tenants/${TENANT_ID}/assignment`, {
        method: "DELETE",
        token: signToken(OWNER_ID),
      }),
      withParams(TENANT_ID),
    );
    expect(res.status).toBe(404);
  });
});
