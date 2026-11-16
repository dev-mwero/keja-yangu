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
vi.mock("@/models/ManagementAssignment", () => ({
  ManagementAssignment: getModelStubs().managementAssignment,
}));

import { GET } from "@/app/api/v1/units/[id]/service-fees/route";

const { user, property, unit, serviceFeeItem, unitServiceFeeOverride, managementAssignment } =
  getModelStubs();

const OWNER_ID = makeObjectId("admin");
const PROPERTY_ID = makeObjectId("p1");
const UNIT_ID = makeObjectId("unit1");

describe("GET /api/v1/units/[id]/service-fees", () => {
  beforeEach(() => {
    resetModelStubs();
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "admin" })));
    unit.findOne.mockReturnValue(
      buildQuery(makeUnit({ _id: UNIT_ID, propertyId: PROPERTY_ID, ownerId: OWNER_ID })),
    );
    unit.find.mockReturnValue(
      buildQuery([
        makeUnit({
          _id: UNIT_ID,
          propertyId: PROPERTY_ID,
          ownerId: OWNER_ID,
          serviceCharge: 0,
        }),
      ]),
    );
    property.findOne.mockReturnValue(
      buildQuery(makeProperty({ _id: PROPERTY_ID, ownerId: OWNER_ID })),
    );
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: OWNER_ID,
          accessRole: "admin",
          scopeType: "property",
          propertyId: PROPERTY_ID,
          permissions: ["unit:manage"],
          status: "active",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
        },
      ]),
    );
    serviceFeeItem.find.mockReturnValue(
      buildQuery([
        {
          _id: "water",
          label: "Water",
          amount: 500,
          active: true,
          sortOrder: 0,
          appliesTo: "all",
          unitIds: [],
          propertyId: PROPERTY_ID,
        },
      ]),
    );
    unitServiceFeeOverride.find.mockReturnValue(buildQuery([]));
  });

  it("returns the resolved breakdown for a manager", async () => {
    const res = await GET(
      buildRequest(`/api/v1/units/${UNIT_ID}/service-fees`, { token: signToken(OWNER_ID) }),
      withParams(UNIT_ID),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(
      expect.objectContaining({
        total: 500,
        breakdown: [{ itemId: "water", label: "Water", amount: 500 }],
      }),
    );
  });

  it("404s for another owner's unit", async () => {
    unit.findOne.mockReturnValue(
      buildQuery(
        makeUnit({ _id: UNIT_ID, propertyId: PROPERTY_ID, ownerId: makeObjectId("other") }),
      ),
    );
    const res = await GET(
      buildRequest(`/api/v1/units/${UNIT_ID}/service-fees`, { token: signToken(OWNER_ID) }),
      withParams(UNIT_ID),
    );
    expect(res.status).toBe(403);
  });
});
