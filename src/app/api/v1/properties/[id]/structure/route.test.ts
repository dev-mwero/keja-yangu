/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeObjectId, makeProperty, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Unit", () => ({ Unit: getModelStubs().unit }));

import { PUT } from "@/app/api/v1/properties/[id]/structure/route";

const { user, property, unit } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const OTHER_OWNER_ID = makeObjectId("other-owner");
const TENANT_ID = makeObjectId("tenant");
const CARETAKER_ID = makeObjectId("caretaker");
const PROPERTY_ID = makeObjectId("p1");
const INVALID_ID = "not-a-valid-objectid";

const BLOCK_ID = makeObjectId("block1");
const FLOOR_ID = makeObjectId("floor1");

function ownedProperty() {
  return makeProperty({
    _id: PROPERTY_ID,
    ownerId: OWNER_ID,
    blocks: [
      {
        _id: BLOCK_ID,
        name: "A",
        order: 0,
        rentOverride: null,
        floors: [{ _id: FLOOR_ID, level: 0, label: "", unitsPerFloor: 2, rentOverride: null }],
      },
    ],
  } as Partial<ReturnType<typeof makeProperty>>);
}

const payload = (blocks: unknown) => ({ blocks });

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("PUT /api/v1/properties/[id]/structure", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("400 for an invalid id", async () => {
    const res = await PUT(
      buildRequest(`/api/v1/properties/${INVALID_ID}`, { method: "PUT", body: payload([]) }),
      withParams(INVALID_ID),
    );
    expect(res.status).toBe(400);
    expect(property.findById).not.toHaveBeenCalled();
  });

  it("404 when the property does not exist", async () => {
    property.findById.mockReturnValue(buildQuery(null));
    const res = await PUT(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`, { method: "PUT", body: payload([]) }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(404);
  });

  it("401 without a token", async () => {
    property.findById.mockReturnValue(buildQuery(ownedProperty()));
    const res = await PUT(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`, { method: "PUT", body: payload([]) }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(401);
  });

  it("403 for a tenant", async () => {
    property.findById.mockReturnValue(buildQuery(ownedProperty()));
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_ID, role: "tenant" })));

    const res = await PUT(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`, {
        method: "PUT",
        token: signToken(TENANT_ID),
        body: payload([]),
      }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(403);
  });

  it("403 when an owner targets another owner's property", async () => {
    property.findById.mockReturnValue(buildQuery(ownedProperty()));
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OTHER_OWNER_ID, role: "owner" })));

    const res = await PUT(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`, {
        method: "PUT",
        token: signToken(OTHER_OWNER_ID),
        body: payload([]),
      }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(403);
  });

  it("400 on an invalid structure payload", async () => {
    property.findById.mockReturnValue(buildQuery(ownedProperty()));
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));

    const res = await PUT(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`, {
        method: "PUT",
        token: signToken(OWNER_ID),
        body: payload([{ name: "", floors: [] }]),
      }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(400);
  });

  it("409 when removing a block that has occupied units", async () => {
    property.findById.mockReturnValue(buildQuery(ownedProperty()));
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    unit.find.mockReturnValue(
      buildQuery([
        {
          _id: makeObjectId("u1"),
          blockId: String(BLOCK_ID),
          floorId: String(FLOOR_ID),
          name: "GA",
          letter: "A",
          status: "occupied",
          tenantId: String(TENANT_ID),
        },
      ]),
    );

    const res = await PUT(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`, {
        method: "PUT",
        token: signToken(OWNER_ID),
        body: payload([]),
      }),
      withParams(PROPERTY_ID),
    );

    expect(res.status).toBe(409);
    expect(unit.softDeleteMany).not.toHaveBeenCalled();
  });

  it("adds a block, materialising its units", async () => {
    property.findById.mockReturnValue(buildQuery(ownedProperty()));
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    unit.find.mockReturnValue(buildQuery([]));
    unit.insertMany.mockResolvedValue([]);
    property.findByIdAndUpdate.mockReturnValue(buildQuery(ownedProperty()));

    const res = await PUT(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`, {
        method: "PUT",
        token: signToken(OWNER_ID),
        body: payload([{ name: "B", floors: [{ level: 3, unitsPerFloor: 2 }] }]),
      }),
      withParams(PROPERTY_ID),
    );

    expect(res.status).toBe(200);
    expect(unit.insertMany).toHaveBeenCalledTimes(1);
    const inserted = unit.insertMany.mock.calls[0][0] as unknown[];
    expect(inserted).toHaveLength(2);
    expect(property.findByIdAndUpdate).toHaveBeenCalledWith(
      PROPERTY_ID,
      { blocks: expect.any(Array) },
      { new: true, runValidators: true },
    );
    const body = await json(res);
    expect(body.summary).toMatchObject({ unitsCreated: 2, unitsDeleted: 0 });
  });

  it("allows a caretaker with edit_property on the managed owner's property", async () => {
    property.findById.mockReturnValue(buildQuery(ownedProperty()));
    user.findById.mockReturnValue(
      buildQuery(
        makeUser({
          _id: CARETAKER_ID,
          role: "caretaker",
          managedByOwnerId: OWNER_ID,
          privileges: ["edit_property"],
        }),
      ),
    );
    unit.find.mockReturnValue(buildQuery([]));
    unit.insertMany.mockResolvedValue([]);
    property.findByIdAndUpdate.mockReturnValue(buildQuery(ownedProperty()));

    const res = await PUT(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}`, {
        method: "PUT",
        token: signToken(CARETAKER_ID),
        body: payload([{ name: "B", floors: [{ level: 1, unitsPerFloor: 1 }] }]),
      }),
      withParams(PROPERTY_ID),
    );

    expect(res.status).toBe(200);
  });
});
