/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeObjectId, makeProperty } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/PropertyView", () => ({ PropertyView: getModelStubs().propertyView }));

import { POST } from "@/app/api/v1/properties/[id]/view/route";

const { property, propertyView } = getModelStubs();
const USER_ID = makeObjectId("view-user");
const PROPERTY_ID = makeObjectId("view-property");

describe("POST /api/v1/properties/[id]/view", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("requires authentication", async () => {
    const response = await POST(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}/view`, { method: "POST" }),
      withParams(PROPERTY_ID),
    );

    expect(response.status).toBe(401);
  });

  it("records views only for public available properties", async () => {
    property.findOne.mockReturnValue(buildQuery(makeProperty({ _id: PROPERTY_ID })));
    propertyView.updateOne.mockResolvedValue({ upsertedCount: 1 });

    const response = await POST(
      buildRequest(`/api/v1/properties/${PROPERTY_ID}/view`, {
        method: "POST",
        token: signToken(USER_ID),
      }),
      withParams(PROPERTY_ID),
    );

    expect(response.status).toBe(200);
    expect(property.findOne).toHaveBeenCalledWith({
      _id: PROPERTY_ID,
      status: "available",
      published: true,
      deletedAt: null,
    });
    expect(propertyView.updateOne).toHaveBeenCalledWith(
      { userId: USER_ID, propertyId: PROPERTY_ID },
      { $set: { viewedAt: expect.any(Date) } },
      { upsert: true },
    );
  });
});
