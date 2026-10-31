/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeObjectId, makeUnit, makeUser, type TestUnit } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Unit", () => ({ Unit: getModelStubs().unit }));
vi.mock("@/lib/notifications", () => ({
  notifyUnitAvailable: vi.fn().mockResolvedValue(true),
}));

import { DELETE, GET, PATCH } from "@/app/api/v1/units/[id]/route";
import { notifyUnitAvailable } from "@/lib/notifications";

const { user, unit } = getModelStubs();
const notifyUnitAvailableMock = vi.mocked(notifyUnitAvailable);

const OWNER_ID = makeObjectId("owner");
const CUSTODIAN_ID = makeObjectId("custodian");
const OTHER_OWNER_ID = makeObjectId("other-owner");
const TENANT_ID = makeObjectId("tenant");
const UNIT_ID = makeObjectId("unit");

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
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest(`/api/v1/units/${UNIT_ID}`), withParams(UNIT_ID));
    expect(res.status).toBe(401);
  });

  it("404 when absent", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    unit.findById.mockReturnValue(buildQuery(null));
    const res = await GET(
      buildRequest(`/api/v1/units/${UNIT_ID}`, { token: signToken(OWNER_ID) }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(404);
  });

  it("owner reads their own unit", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    unit.findById.mockReturnValue(buildQuery(unitDoc()));
    const res = await GET(
      buildRequest(`/api/v1/units/${UNIT_ID}`, { token: signToken(OWNER_ID) }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(200);
  });

  it("403 when a custodian reads a foreign owner's unit", async () => {
    user.findById.mockReturnValue(
      buildQuery(
        makeUser({ _id: CUSTODIAN_ID, role: "custodian", managedByOwnerId: OTHER_OWNER_ID }),
      ),
    );
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
});

describe("PATCH /api/v1/units/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
    notifyUnitAvailableMock.mockClear();
  });

  it("owner updates unit status and rent", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    const doc = persistedUnit();
    unit.findById.mockResolvedValue(doc);

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
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    const doc = persistedUnit();
    unit.findById.mockResolvedValue(doc);

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
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    const doc = persistedUnit({ name: "3A" });
    unit.findById.mockResolvedValue(doc);
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
    user.findById.mockReturnValue(
      buildQuery(
        makeUser({ _id: CUSTODIAN_ID, role: "custodian", managedByOwnerId: OTHER_OWNER_ID }),
      ),
    );
    unit.findById.mockResolvedValue(unitDoc({ ownerId: OWNER_ID }));

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
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    const doc = persistedUnit();
    unit.findById.mockResolvedValue(doc);

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
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    const doc = persistedUnit();
    unit.findById.mockResolvedValue(doc);

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
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    const doc = persistedUnit({ status: "occupied", tenantId: TENANT_ID });
    unit.findById.mockResolvedValue(doc);

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
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    const doc = persistedUnit({ status: "maintenance" });
    unit.findById.mockResolvedValue(doc);

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
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    const doc = persistedUnit({ status: "available" });
    unit.findById.mockResolvedValue(doc);

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
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    const doc = persistedUnit();
    unit.findById.mockResolvedValue(doc);

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
  });

  it("409 when the unit is occupied", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    unit.findById.mockResolvedValue(unitDoc({ status: "occupied", tenantId: TENANT_ID }));
    const res = await DELETE(
      buildRequest(`/api/v1/units/${UNIT_ID}`, { method: "DELETE", token: signToken(OWNER_ID) }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(409);
    expect(unit.softDeleteById).not.toHaveBeenCalled();
  });

  it("owner soft-deletes a vacated unit", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    unit.findById.mockResolvedValue(unitDoc({ status: "available", tenantId: "" }));
    unit.softDeleteById.mockResolvedValue({ acknowledged: true });
    const res = await DELETE(
      buildRequest(`/api/v1/units/${UNIT_ID}`, { method: "DELETE", token: signToken(OWNER_ID) }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(200);
    expect(unit.softDeleteById).toHaveBeenCalledWith(UNIT_ID);
  });
});
