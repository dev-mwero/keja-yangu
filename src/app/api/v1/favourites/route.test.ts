/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeProperty } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/PropertyFavorite", () => ({
  PropertyFavorite: getModelStubs().propertyFavorite,
}));

import { GET, POST } from "@/app/api/v1/favourites/route";

const { property, propertyFavorite } = getModelStubs();
const USER_ID = makeObjectId("favourite-user");
const PROPERTY_ID = makeObjectId("favourite-property");
const TOKEN = signToken(USER_ID);

describe("/api/v1/favourites", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("requires authentication", async () => {
    const response = await GET(buildRequest("/api/v1/favourites"));
    expect(response.status).toBe(401);
  });

  it("returns paginated favourites with property details", async () => {
    propertyFavorite.find.mockReturnValue(
      buildQuery([{ propertyId: PROPERTY_ID, createdAt: new Date("2026-01-01") }]),
    );
    propertyFavorite.countDocuments.mockResolvedValue(1);
    property.find.mockReturnValue(buildQuery([makeProperty({ _id: PROPERTY_ID })]));

    const response = await GET(
      buildRequest("/api/v1/favourites", { token: TOKEN, query: { limit: "5" } }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]._id).toBe(PROPERTY_ID);
    expect(body.pagination).toMatchObject({ page: 1, limit: 5, total: 1 });
    expect(propertyFavorite.find).toHaveBeenCalledWith({ userId: USER_ID });
  });

  it("rejects an invalid property id", async () => {
    const response = await POST(
      buildRequest("/api/v1/favourites", {
        method: "POST",
        token: TOKEN,
        body: { propertyId: "invalid" },
      }),
    );

    expect(response.status).toBe(400);
    expect(propertyFavorite.create).not.toHaveBeenCalled();
  });

  it("adds a favourite for a published, available property", async () => {
    property.findOne.mockReturnValue(buildQuery(makeProperty({ _id: PROPERTY_ID })));
    propertyFavorite.findOne.mockReturnValue(buildQuery(null));
    propertyFavorite.create.mockResolvedValue({ propertyId: PROPERTY_ID });

    const response = await POST(
      buildRequest("/api/v1/favourites", {
        method: "POST",
        token: TOKEN,
        body: { propertyId: PROPERTY_ID },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ propertyId: PROPERTY_ID, favourited: true });
    expect(propertyFavorite.create).toHaveBeenCalledWith({
      userId: USER_ID,
      propertyId: PROPERTY_ID,
    });
  });

  it("removes an existing favourite on toggle", async () => {
    property.findOne.mockReturnValue(buildQuery(makeProperty({ _id: PROPERTY_ID })));
    propertyFavorite.findOne.mockReturnValue(buildQuery({ _id: "favorite-record" }));
    propertyFavorite.deleteOne.mockResolvedValue({ deletedCount: 1 });

    const response = await POST(
      buildRequest("/api/v1/favourites", {
        method: "POST",
        token: TOKEN,
        body: { propertyId: PROPERTY_ID },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ propertyId: PROPERTY_ID, favourited: false });
    expect(propertyFavorite.deleteOne).toHaveBeenCalledWith({ _id: "favorite-record" });
  });
});
