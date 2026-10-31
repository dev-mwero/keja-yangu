/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeProperty, makeUnit } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Unit", () => ({ Unit: getModelStubs().unit }));
vi.mock("@/models/UnitFavorite", () => ({ UnitFavorite: getModelStubs().unitFavorite }));

import { GET, POST } from "@/app/api/v1/favourites/units/route";

const { property, unit, unitFavorite } = getModelStubs();
const USER_ID = makeObjectId("favourite-user");
const PROPERTY_ID = makeObjectId("favourite-property");
const UNIT_ID = makeObjectId("favourite-unit");
const TOKEN = signToken(USER_ID);

describe("/api/v1/favourites/units", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("requires authentication", async () => {
    const response = await GET(buildRequest("/api/v1/favourites/units"));
    expect(response.status).toBe(401);
  });

  it("returns paginated unit favourites with property details", async () => {
    unitFavorite.find.mockReturnValue(
      buildQuery([{ unitId: UNIT_ID, propertyId: PROPERTY_ID, createdAt: new Date("2026-01-01") }]),
    );
    unitFavorite.countDocuments.mockResolvedValue(1);
    unit.find.mockReturnValue(buildQuery([makeUnit({ _id: UNIT_ID, propertyId: PROPERTY_ID })]));
    property.find.mockReturnValue(
      buildQuery([makeProperty({ _id: PROPERTY_ID, title: "Riverside" })]),
    );

    const response = await GET(
      buildRequest("/api/v1/favourites/units", { token: TOKEN, query: { limit: "5" } }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      _id: UNIT_ID,
      name: "3A",
      property: { _id: PROPERTY_ID, title: "Riverside" },
    });
    expect(body.pagination).toMatchObject({ page: 1, limit: 5, total: 1 });
    expect(unitFavorite.find).toHaveBeenCalledWith({ userId: USER_ID });
  });

  it("omits favourites whose property is no longer published", async () => {
    unitFavorite.find.mockReturnValue(
      buildQuery([{ unitId: UNIT_ID, propertyId: PROPERTY_ID, createdAt: new Date() }]),
    );
    unitFavorite.countDocuments.mockResolvedValue(1);
    unit.find.mockReturnValue(buildQuery([makeUnit({ _id: UNIT_ID, propertyId: PROPERTY_ID })]));
    property.find.mockReturnValue(buildQuery([]));

    const response = await GET(buildRequest("/api/v1/favourites/units", { token: TOKEN }));
    const body = await response.json();

    expect(body.data).toEqual([]);
  });

  it("rejects an invalid unit id", async () => {
    const response = await POST(
      buildRequest("/api/v1/favourites/units", {
        method: "POST",
        token: TOKEN,
        body: { unitId: "invalid" },
      }),
    );

    expect(response.status).toBe(400);
    expect(unitFavorite.create).not.toHaveBeenCalled();
  });

  it("rejects a unit whose property is not published", async () => {
    unit.findById.mockReturnValue(buildQuery(makeUnit({ _id: UNIT_ID, propertyId: PROPERTY_ID })));
    property.findOne.mockReturnValue(buildQuery(null));

    const response = await POST(
      buildRequest("/api/v1/favourites/units", {
        method: "POST",
        token: TOKEN,
        body: { unitId: UNIT_ID },
      }),
    );

    expect(response.status).toBe(404);
    expect(unitFavorite.create).not.toHaveBeenCalled();
  });

  it("adds a favourite for a unit that is not currently available", async () => {
    unit.findById.mockReturnValue(
      buildQuery(makeUnit({ _id: UNIT_ID, propertyId: PROPERTY_ID, status: "maintenance" })),
    );
    property.findOne.mockReturnValue(buildQuery(makeProperty({ _id: PROPERTY_ID })));
    unitFavorite.findOne.mockReturnValue(buildQuery(null));
    unitFavorite.create.mockResolvedValue({ unitId: UNIT_ID });

    const response = await POST(
      buildRequest("/api/v1/favourites/units", {
        method: "POST",
        token: TOKEN,
        body: { unitId: UNIT_ID },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ unitId: UNIT_ID, favourited: true });
    expect(unitFavorite.create).toHaveBeenCalledWith({
      userId: USER_ID,
      unitId: UNIT_ID,
      propertyId: PROPERTY_ID,
    });
  });

  it("removes an existing unit favourite on toggle", async () => {
    unit.findById.mockReturnValue(buildQuery(makeUnit({ _id: UNIT_ID, propertyId: PROPERTY_ID })));
    property.findOne.mockReturnValue(buildQuery(makeProperty({ _id: PROPERTY_ID })));
    unitFavorite.findOne.mockReturnValue(buildQuery({ _id: "favorite-record" }));
    unitFavorite.deleteOne.mockResolvedValue({ deletedCount: 1 });

    const response = await POST(
      buildRequest("/api/v1/favourites/units", {
        method: "POST",
        token: TOKEN,
        body: { unitId: UNIT_ID },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ unitId: UNIT_ID, favourited: false });
    expect(unitFavorite.deleteOne).toHaveBeenCalledWith({ _id: "favorite-record" });
  });
});
