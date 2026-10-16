/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));
vi.mock("@/models/Unit", () => ({ Unit: getModelStubs().unit }));
vi.mock("@/models/UnitPreference", () => ({ UnitPreference: getModelStubs().unitpreference }));

import { DELETE, PUT } from "@/app/api/v1/units/[id]/prefer/route";

const { user, tenant, unit, unitpreference } = getModelStubs();

const TENANT_ID = makeObjectId("tenant-user");
const OWNER_ID = makeObjectId("owner");
const PROPERTY_ID = makeObjectId("property");
const OTHER_PROPERTY_ID = makeObjectId("other-property");
const UNIT_ID = makeObjectId("unit");
const INVALID_ID = "not-a-valid-objectid";

function vacancy(status: "available" | "occupied" = "available", propertyId = PROPERTY_ID) {
  return {
    _id: UNIT_ID,
    propertyId,
    ownerId: OWNER_ID,
    blockId: makeObjectId("block"),
    blockName: "A",
    floorId: makeObjectId("floor"),
    floorLevel: 0,
    floorLabel: "Ground",
    name: "GA",
    letter: "A",
    status,
    tenantId: "",
  };
}

function reasonTenantProperty() {
  tenant.find.mockReturnValue(buildQuery([{ propertyId: PROPERTY_ID }]));
}

describe("PUT /api/v1/units/[id]/prefer", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("400 for an invalid unit id", async () => {
    const res = await PUT(
      buildRequest(`/api/v1/units/${INVALID_ID}/prefer`, { method: "PUT" }),
      withParams(INVALID_ID),
    );
    expect(res.status).toBe(400);
    expect(unit.findById).not.toHaveBeenCalled();
  });

  it("401 without a token", async () => {
    const res = await PUT(
      buildRequest(`/api/v1/units/${UNIT_ID}/prefer`, { method: "PUT" }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(401);
  });

  it("403 for a non-tenant role", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    const res = await PUT(
      buildRequest(`/api/v1/units/${UNIT_ID}/prefer`, {
        method: "PUT",
        token: signToken(OWNER_ID),
      }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(403);
  });

  it("404 when the unit is missing", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_ID, role: "tenant" })));
    unit.findById.mockReturnValue(buildQuery(null));
    const res = await PUT(
      buildRequest(`/api/v1/units/${UNIT_ID}/prefer`, {
        method: "PUT",
        token: signToken(TENANT_ID),
      }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(404);
  });

  it("409 when the unit is not vacant", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_ID, role: "tenant" })));
    unit.findById.mockReturnValue(buildQuery(vacancy("occupied")));
    const res = await PUT(
      buildRequest(`/api/v1/units/${UNIT_ID}/prefer`, {
        method: "PUT",
        token: signToken(TENANT_ID),
      }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(409);
    expect(unitpreference.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("403 when the unit is at a property the tenant does not tenancy", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_ID, role: "tenant" })));
    unit.findById.mockReturnValue(buildQuery(vacancy("available", OTHER_PROPERTY_ID)));
    reasonTenantProperty();
    const res = await PUT(
      buildRequest(`/api/v1/units/${UNIT_ID}/prefer`, {
        method: "PUT",
        token: signToken(TENANT_ID),
      }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(403);
  });

  it("records the preference for a vacant unit at the tenant's property", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_ID, role: "tenant" })));
    unit.findById.mockReturnValue(buildQuery(vacancy()));
    reasonTenantProperty();
    unitpreference.findOneAndUpdate.mockReturnValue(
      buildQuery({ _id: makeObjectId("pref"), unitId: UNIT_ID, propertyId: PROPERTY_ID }),
    );

    const res = await PUT(
      buildRequest(`/api/v1/units/${UNIT_ID}/prefer`, {
        method: "PUT",
        token: signToken(TENANT_ID),
        body: { note: "Near the lift" },
      }),
      withParams(UNIT_ID),
    );

    expect(res.status).toBe(200);
    expect(unitpreference.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: TENANT_ID, propertyId: PROPERTY_ID, deletedAt: null },
      expect.objectContaining({
        $set: expect.objectContaining({ unitId: UNIT_ID, note: "Near the lift" }),
      }),
      expect.objectContaining({ upsert: true, new: true }),
    );
  });
});

describe("DELETE /api/v1/units/[id]/prefer", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("clears the tenant's preference", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_ID, role: "tenant" })));
    unitpreference.softDeleteMany.mockResolvedValue({ acknowledged: true });

    const res = await DELETE(
      buildRequest(`/api/v1/units/${UNIT_ID}/prefer`, {
        method: "DELETE",
        token: signToken(TENANT_ID),
      }),
      withParams(UNIT_ID),
    );

    expect(res.status).toBe(200);
    expect(unitpreference.softDeleteMany).toHaveBeenCalledWith({
      userId: TENANT_ID,
      unitId: UNIT_ID,
    });
  });

  it("403 for a non-tenant role", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    const res = await DELETE(
      buildRequest(`/api/v1/units/${UNIT_ID}/prefer`, {
        method: "DELETE",
        token: signToken(OWNER_ID),
      }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(403);
    expect(unitpreference.softDeleteMany).not.toHaveBeenCalled();
  });
});
