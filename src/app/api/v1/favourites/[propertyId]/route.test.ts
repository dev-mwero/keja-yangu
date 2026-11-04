/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/PropertyFavorite", () => ({
  PropertyFavorite: getModelStubs().propertyFavorite,
}));

import { DELETE, GET } from "@/app/api/v1/favourites/[propertyId]/route";

const { propertyFavorite } = getModelStubs();
const USER_ID = makeObjectId("favourite-user");
const PROPERTY_ID = makeObjectId("favourite-property");
const context = { params: Promise.resolve({ propertyId: PROPERTY_ID }) };

describe("/api/v1/favourites/[propertyId]", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("reports the current user's favourite state", async () => {
    propertyFavorite.findOne.mockReturnValue(buildQuery({ _id: "favorite-record" }));

    const response = await GET(
      buildRequest(`/api/v1/favourites/${PROPERTY_ID}`, { token: signToken(USER_ID) }),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { propertyId: PROPERTY_ID, favourited: true },
    });
    expect(propertyFavorite.findOne).toHaveBeenCalledWith({
      userId: USER_ID,
      propertyId: PROPERTY_ID,
    });
  });

  it("removes the current user's favourite", async () => {
    propertyFavorite.deleteOne.mockResolvedValue({ deletedCount: 1 });

    const response = await DELETE(
      buildRequest(`/api/v1/favourites/${PROPERTY_ID}`, {
        method: "DELETE",
        token: signToken(USER_ID),
      }),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { propertyId: PROPERTY_ID, favourited: false },
    });
    expect(propertyFavorite.deleteOne).toHaveBeenCalledWith({
      userId: USER_ID,
      propertyId: PROPERTY_ID,
    });
  });

  it("rejects malformed property ids", async () => {
    const response = await GET(
      buildRequest("/api/v1/favourites/not-an-id", { token: signToken(USER_ID) }),
      { params: Promise.resolve({ propertyId: "not-an-id" }) },
    );

    expect(response.status).toBe(400);
  });
});
