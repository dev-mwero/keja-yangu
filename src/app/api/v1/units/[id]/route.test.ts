/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import {
  makeObjectId,
  makeProperty,
  makeUnit,
  makeUser,
  type TestUnit,
} from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Unit", () => ({ Unit: getModelStubs().unit }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/ManagementAssignment", () => ({
  ManagementAssignment: getModelStubs().managementAssignment,
}));
vi.mock("@/lib/notifications", () => ({
  notifyUnitAvailable: vi.fn().mockResolvedValue(true),
}));

import { DELETE, GET, PATCH } from "@/app/api/v1/units/[id]/route";
import { notifyUnitAvailable } from "@/lib/notifications";

const { user, unit, property, managementAssignment } = getModelStubs();
const notifyUnitAvailableMock = vi.mocked(notifyUnitAvailable);

const OWNER_ID = makeObjectId("owner");
const CUSTODIAN_ID = makeObjectId("custodian");
const TENANT_ID = makeObjectId("tenant");
const CARETAKER_ID = makeObjectId("caretaker");
const UNIT_ID = makeObjectId("unit");
const UNIT_PROPERTY_ID = makeObjectId("unit-property");

function unitDoc(overrides = {}) {
  return makeUnit({ _id: UNIT_ID, ownerId: OWNER_ID, ...overrides });
}

type PersistedUnit = TestUnit & {
  save: ReturnType<typeof vi.fn>;
  toObject: ReturnType<typeof vi.fn>;
};

function persistedUnit(overrides = {}): PersistedUnit {
  const doc = { ...unitDoc(overrides) } as PersistedUnit;
  doc.save = vi.fn().mockResolvedValue(doc);
  doc.toObject = vi.fn().mockReturnValue(doc);
  return doc;
}

describe("GET /api/v1/units/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
    property.findOne.mockReturnValue(
      buildQuery(
        makeProperty({
          _id: makeObjectId("prop"),
          blocks: [{ _id: makeObjectId("block") }],
        } as any),
      ),
    );
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: OWNER_ID,
          accessRole: "admin",
          scopeType: "property",
          propertyId: makeObjectId("prop"),
          permissions: ["unit:read", "unit:manage"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest(`/api/v1/units/${UNIT_ID}`), withParams(UNIT_ID));
    expect(res.status).toBe(401);
  });

  it("404 when absent", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "admin" })));
    unit.findById.mockReturnValue(buildQuery(null));
    const res = await GET(
      buildRequest(`/api/v1/units/${UNIT_ID}`, { token: signToken(OWNER_ID) }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(404);
  });

  it("owner reads their own unit", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "admin" })));
    unit.findById.mockReturnValue(buildQuery(unitDoc()));
    property.findOne.mockReturnValue(
      buildQuery(
        makeProperty({
          _id: makeObjectId("prop"),
          blocks: [{ _id: makeObjectId("block") }],
        } as any),
      ),
    );
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: OWNER_ID,
          accessRole: "admin",
          scopeType: "property",
          propertyId: makeObjectId("prop"),
          permissions: ["unit:read"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
    const res = await GET(
      buildRequest(`/api/v1/units/${UNIT_ID}`, { token: signToken(OWNER_ID) }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(200);
  });

  it("403 when a custodian reads a foreign owner's unit", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: CUSTODIAN_ID, role: "custodian" })));
    unit.findById.mockReturnValue(buildQuery(unitDoc({ ownerId: OWNER_ID })));
    const res = await GET(
      buildRequest(`/api/v1/units/${UNIT_ID}`, { token: signToken(CUSTODIAN_ID) }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(403);
  });

  it("403 when a tenant reads a unit they do not occupy", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_ID, role: "tenant" })));
    unit.findById.mockReturnValue(buildQuery(unitDoc({ tenantId: makeObjectId("someone") })));
    const res = await GET(
      buildRequest(`/api/v1/units/${UNIT_ID}`, {
        token: signToken(TENANT_ID, { role: "tenant" }),
      }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(403);
  });

  it("403 when a caretaker reads a unit outside their assigned properties", async () => {
    user.findById.mockReturnValue(
      buildQuery(
        makeUser({
          _id: CARETAKER_ID,
          role: "caretaker",
        }),
      ),
    );
    unit.findById.mockReturnValue(buildQuery(unitDoc({ propertyId: UNIT_PROPERTY_ID })));
    property.findOne.mockReturnValue(buildQuery(null));

    const res = await GET(
      buildRequest(`/api/v1/units/${UNIT_ID}`, { token: signToken(CARETAKER_ID) }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(403);
  });

  it("allows a caretaker to read a unit in an assigned property", async () => {
    user.findById.mockReturnValue(
      buildQuery(
        makeUser({
          _id: CARETAKER_ID,
          role: "caretaker",
        }),
      ),
    );
    unit.findById.mockReturnValue(buildQuery(unitDoc({ propertyId: UNIT_PROPERTY_ID })));
    property.findOne.mockReturnValue(
      buildQuery(
        makeProperty({ _id: UNIT_PROPERTY_ID, blocks: [{ _id: makeObjectId("block") }] } as any),
      ),
    );
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: CARETAKER_ID,
          accessRole: "caretaker",
          scopeType: "property",
          propertyId: UNIT_PROPERTY_ID,
          permissions: ["unit:read"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );

    const res = await GET(
      buildRequest(`/api/v1/units/${UNIT_ID}`, { token: signToken(CARETAKER_ID) }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/v1/units/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
    notifyUnitAvailableMock.mockClear();
    property.findOne.mockReturnValue(
      buildQuery(
        makeProperty({
          _id: makeObjectId("prop"),
          blocks: [{ _id: makeObjectId("block") }],
        } as any),
      ),
    );
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: OWNER_ID,
          accessRole: "admin",
          scopeType: "property",
          propertyId: makeObjectId("prop"),
          permissions: ["unit:read", "unit:manage"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
  });

  it("403 when a caretaker edits a unit outside their assigned properties", async () => {
    user.findById.mockReturnValue(
      buildQuery(
        makeUser({
          _id: CARETAKER_ID,
          role: "caretaker",
          privileges: ["manage_units"],
        }),
      ),
    );
    unit.findById.mockReturnValue(buildQuery(unitDoc({ propertyId: UNIT_PROPERTY_ID })));
    property.findOne.mockReturnValue(buildQuery(null));

    const res = await PATCH(
      buildRequest(`/api/v1/units/${UNIT_ID}`, {
        method: "PATCH",
        token: signToken(CARETAKER_ID),
        body: { status: "maintenance" },
      }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(403);
  });

  it("owner updates unit status and rent", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "admin" })));
    const doc = persistedUnit();
    unit.findById.mockReturnValue(buildQuery(doc));

    const res = await PATCH(
      buildRequest(`/api/v1/units/${UNIT_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { status: "maintenance", rent: 30000 },
      }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(200);
    expect(doc.status).toBe("maintenance");
    expect(doc.rent).toBe(30000);
    expect(doc.save).toHaveBeenCalled();
  });

  it("owner updates unit purpose override", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "admin" })));
    const doc = persistedUnit();
    unit.findById.mockReturnValue(buildQuery(doc));

    const res = await PATCH(
      buildRequest(`/api/v1/units/${UNIT_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { purpose: "commercial" },
      }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(200);
    expect(doc.purpose).toBe("commercial");
    expect(doc.save).toHaveBeenCalled();
  });

  it("409 when renaming to a name already used in the block", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "admin" })));
    const doc = persistedUnit({ name: "3A" });
    unit.findById.mockReturnValue(buildQuery(doc));
    unit.findOne.mockReturnValue(buildQuery({ _id: makeObjectId("other") }));

    const res = await PATCH(
      buildRequest(`/api/v1/units/${UNIT_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { name: "3B" },
      }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(409);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it("403 for a custodian managing a foreign owner's unit", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: CUSTODIAN_ID, role: "custodian" })));
    unit.findById.mockReturnValue(buildQuery(unitDoc({ ownerId: OWNER_ID })));

    const res = await PATCH(
      buildRequest(`/api/v1/units/${UNIT_ID}`, {
        method: "PATCH",
        token: signToken(CUSTODIAN_ID),
        body: { status: "available" },
      }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(403);
  });

  it("rejects setting tenantId directly (occupancy changes via allocation)", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "admin" })));
    const doc = persistedUnit();
    unit.findById.mockReturnValue(buildQuery(doc));

    const res = await PATCH(
      buildRequest(`/api/v1/units/${UNIT_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { tenantId: TENANT_ID },
      }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(400);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it("rejects setting status occupied directly", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "admin" })));
    const doc = persistedUnit();
    unit.findById.mockReturnValue(buildQuery(doc));

    const res = await PATCH(
      buildRequest(`/api/v1/units/${UNIT_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { status: "occupied" },
      }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(409);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it("rejects flipping an occupied unit to available directly", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "admin" })));
    const doc = persistedUnit({ status: "occupied", tenantId: TENANT_ID });
    unit.findById.mockReturnValue(buildQuery(doc));

    const res = await PATCH(
      buildRequest(`/api/v1/units/${UNIT_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { status: "available" },
      }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(409);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it("notifies favourites when a unit transitions to available", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "admin" })));
    const doc = persistedUnit({ status: "maintenance" });
    unit.findById.mockReturnValue(buildQuery(doc));

    const res = await PATCH(
      buildRequest(`/api/v1/units/${UNIT_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { status: "available" },
      }),
      withParams(UNIT_ID),
    );

    expect(res.status).toBe(200);
    expect(doc.statusChangedAt).toBeInstanceOf(Date);
    expect(notifyUnitAvailableMock).toHaveBeenCalledWith(doc);
  });

  it("does not notify when the status is already available", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "admin" })));
    const doc = persistedUnit({ status: "available" });
    unit.findById.mockReturnValue(buildQuery(doc));

    const res = await PATCH(
      buildRequest(`/api/v1/units/${UNIT_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { status: "available" },
      }),
      withParams(UNIT_ID),
    );

    expect(res.status).toBe(200);
    expect(notifyUnitAvailableMock).not.toHaveBeenCalled();
  });

  it("owner updates unit service-charge configuration", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "admin" })));
    const doc = persistedUnit();
    unit.findById.mockReturnValue(buildQuery(doc));

    const res = await PATCH(
      buildRequest(`/api/v1/units/${UNIT_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: {
          serviceCharge: 5000,
          rentIncludesServiceCharge: true,
          rentSharePercent: 80,
          serviceChargeSharePercent: 20,
        },
      }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(200);
    expect(doc.serviceCharge).toBe(5000);
    expect(doc.rentIncludesServiceCharge).toBe(true);
    expect(doc.rentSharePercent).toBe(80);
    expect(doc.serviceChargeSharePercent).toBe(20);
    expect(doc.save).toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/units/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
    property.findOne.mockReturnValue(
      buildQuery(
        makeProperty({
          _id: makeObjectId("prop"),
          blocks: [{ _id: makeObjectId("block") }],
        } as any),
      ),
    );
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: OWNER_ID,
          accessRole: "admin",
          scopeType: "property",
          propertyId: makeObjectId("prop"),
          permissions: ["unit:read", "unit:manage"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
  });

  it("409 when the unit is occupied", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "admin" })));
    unit.findById.mockReturnValue(buildQuery(unitDoc({ status: "occupied", tenantId: TENANT_ID })));
    const res = await DELETE(
      buildRequest(`/api/v1/units/${UNIT_ID}`, { method: "DELETE", token: signToken(OWNER_ID) }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(409);
    expect(unit.softDeleteById).not.toHaveBeenCalled();
  });

  it("owner soft-deletes a vacated unit", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "admin" })));
    unit.findById.mockReturnValue(buildQuery(unitDoc({ status: "available", tenantId: "" })));
    unit.softDeleteById.mockResolvedValue({ acknowledged: true });
    const res = await DELETE(
      buildRequest(`/api/v1/units/${UNIT_ID}`, { method: "DELETE", token: signToken(OWNER_ID) }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(200);
    expect(unit.softDeleteById).toHaveBeenCalledWith(UNIT_ID);
  });
});
