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

import { GET } from "@/app/api/v1/properties/[id]/unit-counts/route";

const { user, property, unit } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const OTHER_OWNER_ID = makeObjectId("other-owner");
const TENANT_ID = makeObjectId("tenant");
const PROPERTY_ID = makeObjectId("p1");
const INVALID_ID = "not-a-valid-objectid";

async function json(res: Response) {
  return (await res.json()) as { data?: Record<string, number>; error?: string };
}

describe("GET /api/v1/properties/[id]/unit-counts", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("400 for an invalid id", async () => {
    const res = await GET(
      buildRequest(`/api/v1/properties/${INVALID_ID}/unit-counts`),
      withParams(INVALID_ID),
    );
    expect(res.status).toBe(400);
    expect(property.findById).not.toHaveBeenCalled();
  });

  it("404 when the property does not exist", async () => {
    property.findById.mockReturnValue(buildQuery(null));
    const res = await GET(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}/unit-counts`),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(404);
  });

  it("401 without a token", async () => {
    property.findById.mockReturnValue(
      buildQuery(makeProperty({ _id: PROPERTY_ID, ownerId: OWNER_ID })),
    );
    const res = await GET(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}/unit-counts`),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(401);
  });

  it("403 for a tenant", async () => {
    property.findById.mockReturnValue(
      buildQuery(makeProperty({ _id: PROPERTY_ID, ownerId: OWNER_ID })),
    );
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_ID, role: "tenant" })));

    const res = await GET(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}/unit-counts`, {
        token: signToken(TENANT_ID, { role: "tenant" }),
      }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(403);
  });

  it("403 when an owner targets another owner's property", async () => {
    property.findById.mockReturnValue(
      buildQuery(makeProperty({ _id: PROPERTY_ID, ownerId: OWNER_ID })),
    );
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OTHER_OWNER_ID, role: "owner" })));

    const res = await GET(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}/unit-counts`, {
        token: signToken(OTHER_OWNER_ID, { role: "owner" }),
      }),
      withParams(PROPERTY_ID),
    );
    expect(res.status).toBe(403);
  });

  it("returns counts by status for the owner", async () => {
    property.findById.mockReturnValue(
      buildQuery(makeProperty({ _id: PROPERTY_ID, ownerId: OWNER_ID })),
    );
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    unit.countDocuments
      .mockResolvedValueOnce(3) // occupied
      .mockResolvedValueOnce(2) // vacant
      .mockResolvedValueOnce(1); // maintenance

    const res = await GET(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}/unit-counts`, {
        token: signToken(OWNER_ID, { role: "owner" }),
      }),
      withParams(PROPERTY_ID),
    );

    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual({
      total: 6,
      occupied: 3,
      vacant: 2,
      maintenance: 1,
    });
    expect(unit.countDocuments).toHaveBeenCalledWith({
      propertyId: PROPERTY_ID,
      status: "occupied",
    });
    expect(unit.countDocuments).toHaveBeenCalledWith({
      propertyId: PROPERTY_ID,
      status: "available",
    });
    expect(unit.countDocuments).toHaveBeenCalledWith({
      propertyId: PROPERTY_ID,
      status: "maintenance",
    });
  });
});
