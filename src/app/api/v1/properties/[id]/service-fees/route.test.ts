/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeObjectId, makeProperty, makeUnit, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Unit", () => ({ Unit: getModelStubs().unit }));
vi.mock("@/models/ServiceFeeItem", () => ({ ServiceFeeItem: getModelStubs().serviceFeeItem }));
vi.mock("@/models/UnitServiceFeeOverride", () => ({
  UnitServiceFeeOverride: getModelStubs().unitServiceFeeOverride,
}));

import { DELETE, PATCH } from "@/app/api/v1/properties/[id]/service-fees/[itemId]/route";
import { GET, POST } from "@/app/api/v1/properties/[id]/service-fees/route";
import { PUT } from "@/app/api/v1/properties/[id]/service-fees/overrides/route";

const { user, property, unit, serviceFeeItem, unitServiceFeeOverride } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const OTHER_OWNER_ID = makeObjectId("other-owner");
const PROPERTY_ID = makeObjectId("p1");
const ITEM_ID = makeObjectId("item1");
const UNIT_ID = makeObjectId("unit1");
const INVALID_ID = "not-a-valid-objectid";

function owner() {
  return makeUser({ _id: OWNER_ID, role: "owner" });
}

function ownProperty() {
  return makeProperty({ _id: PROPERTY_ID, ownerId: OWNER_ID });
}

function item(overrides: Record<string, unknown> = {}) {
  return {
    _id: ITEM_ID,
    ownerId: OWNER_ID,
    propertyId: PROPERTY_ID,
    label: "Water",
    amount: 500,
    active: true,
    sortOrder: 0,
    appliesTo: "all",
    unitIds: [],
    toObject() {
      return { ...this };
    },
    ...overrides,
  };
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("property service-fee routes", () => {
  beforeEach(() => {
    resetModelStubs();
    user.findById.mockReturnValue(buildQuery(owner()));
    property.findOne.mockReturnValue(buildQuery(ownProperty()));
  });

  it("400 for an invalid property id", async () => {
    const res = await GET(
      buildRequest(`/api/v1/properties/${INVALID_ID}/service-fees`, { token: signToken(OWNER_ID) }),
      withParams(INVALID_ID),
    );
    expect(res.status).toBe(400);
  });

  it("401 without a token", async () => {
    const res = await GET(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}/service-fees`),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(401);
  });

  it("lists template items and overrides for a manager", async () => {
    serviceFeeItem.find.mockReturnValue(buildQuery([item()]));
    unitServiceFeeOverride.find.mockReturnValue(buildQuery([]));

    const res = await GET(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}/service-fees`, {
        token: signToken(OWNER_ID),
      }),
      withParams(PROPERTY_ID),
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    expect((body.data as { items: unknown[] }).items).toHaveLength(1);
  });

  it("creates an all-units fee item", async () => {
    serviceFeeItem.create.mockImplementation(async (input: Record<string, unknown>) => item(input));

    const res = await POST(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}/service-fees`, {
        token: signToken(OWNER_ID),
        method: "POST",
        body: { label: " Water ", amount: 500 },
      }),
      withParams(PROPERTY_ID),
    );

    expect(res.status).toBe(201);
    expect(serviceFeeItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: OWNER_ID,
        propertyId: PROPERTY_ID,
        label: "Water",
        amount: 500,
        appliesTo: "all",
        unitIds: [],
      }),
    );
  });

  it("rejects selected items with no units", async () => {
    const res = await POST(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}/service-fees`, {
        token: signToken(OWNER_ID),
        method: "POST",
        body: { label: "Water", amount: 500, appliesTo: "selected", unitIds: [] },
      }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(400);
  });

  it("rejects selected units from another property", async () => {
    unit.find.mockReturnValue(buildQuery([]));

    const res = await POST(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}/service-fees`, {
        token: signToken(OWNER_ID),
        method: "POST",
        body: {
          label: "Water",
          amount: 500,
          appliesTo: "selected",
          unitIds: [UNIT_ID],
        },
      }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(400);
  });

  it("updates an item and clears unit ids when switching to all units", async () => {
    serviceFeeItem.findOne.mockReturnValue(buildQuery(item({ appliesTo: "selected", unitIds: [UNIT_ID] })));
    serviceFeeItem.findOneAndUpdate.mockReturnValue(buildQuery(item({ amount: 700 })));

    const res = await PATCH(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}/service-fees/${ITEM_ID}`, {
        token: signToken(OWNER_ID),
        method: "PATCH",
        body: { amount: 700, appliesTo: "all", unitIds: [] },
      }),
      { params: Promise.resolve({ id: PROPERTY_ID, itemId: ITEM_ID }) },
    );

    expect(res.status).toBe(200);
    expect(serviceFeeItem.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: ITEM_ID, propertyId: PROPERTY_ID },
      expect.objectContaining({ amount: 700, appliesTo: "all", unitIds: [] }),
      expect.any(Object),
    );
  });

  it("soft-disables an item instead of deleting it", async () => {
    serviceFeeItem.findOneAndUpdate.mockReturnValue(buildQuery(item({ active: false })));

    const res = await DELETE(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}/service-fees/${ITEM_ID}`, {
        token: signToken(OWNER_ID),
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: PROPERTY_ID, itemId: ITEM_ID }) },
    );

    expect(res.status).toBe(200);
    expect(serviceFeeItem.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: ITEM_ID, propertyId: PROPERTY_ID },
      { $set: { active: false } },
      { new: true },
    );
  });

  it("rejects a foreign owner", async () => {
    property.findOne.mockReturnValue(
      buildQuery(makeProperty({ _id: PROPERTY_ID, ownerId: OTHER_OWNER_ID })),
    );
    const res = await GET(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}/service-fees`, {
        token: signToken(OWNER_ID),
      }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(403);
  });

  it("upserts overrides and deletes cleared ones", async () => {
    unit.find.mockReturnValue(buildQuery([makeUnit({ _id: UNIT_ID, propertyId: PROPERTY_ID })]));
    serviceFeeItem.find.mockReturnValue(
      buildQuery([{ _id: ITEM_ID }, { _id: makeObjectId("item2") }]),
    );
    unitServiceFeeOverride.findOneAndUpdate.mockResolvedValue({});
    unitServiceFeeOverride.deleteOne.mockResolvedValue({ deletedCount: 1 });
    unitServiceFeeOverride.find.mockReturnValue(buildQuery([{ itemId: ITEM_ID, unitId: UNIT_ID }]));

    const res = await PUT(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}/service-fees/overrides`, {
        token: signToken(OWNER_ID),
        method: "PUT",
        body: {
          unitId: UNIT_ID,
          overrides: [
            { itemId: ITEM_ID, amount: 700 },
            { itemId: makeObjectId("item2"), amount: null, active: null },
          ],
        },
      }),
      withParams(PROPERTY_ID),
    );

    expect(res.status).toBe(200);
    expect(unitServiceFeeOverride.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(unitServiceFeeOverride.deleteOne).toHaveBeenCalledTimes(1);
  });

  it("rejects duplicate overrides for the same item", async () => {
    const res = await PUT(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}/service-fees/overrides`, {
        token: signToken(OWNER_ID),
        method: "PUT",
        body: {
          unitId: UNIT_ID,
          overrides: [
            { itemId: ITEM_ID, amount: 700 },
            { itemId: ITEM_ID, amount: 800 },
          ],
        },
      }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(400);
  });
});
