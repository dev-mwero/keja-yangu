/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/UnitFavorite", () => ({ UnitFavorite: getModelStubs().unitFavorite }));

import { DELETE, GET } from "@/app/api/v1/favourites/units/[unitId]/route";

const { unitFavorite } = getModelStubs();
const USER_ID = makeObjectId("favourite-user");
const UNIT_ID = makeObjectId("favourite-unit");
const context = { params: Promise.resolve({ unitId: UNIT_ID }) };

describe("/api/v1/favourites/units/[unitId]", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("reports the current user's unit favourite state", async () => {
    unitFavorite.findOne.mockReturnValue(buildQuery({ _id: "favorite-record" }));

    const response = await GET(
      buildRequest(`/api/v1/favourites/units/${UNIT_ID}`, { token: signToken(USER_ID) }),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { unitId: UNIT_ID, favourited: true },
    });
    expect(unitFavorite.findOne).toHaveBeenCalledWith({
      userId: USER_ID,
      unitId: UNIT_ID,
    });
  });

  it("removes the current user's unit favourite", async () => {
    unitFavorite.deleteOne.mockResolvedValue({ deletedCount: 1 });

    const response = await DELETE(
      buildRequest(`/api/v1/favourites/units/${UNIT_ID}`, {
        method: "DELETE",
        token: signToken(USER_ID),
      }),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { unitId: UNIT_ID, favourited: false },
    });
    expect(unitFavorite.deleteOne).toHaveBeenCalledWith({
      userId: USER_ID,
      unitId: UNIT_ID,
    });
  });

  it("rejects malformed unit ids", async () => {
    const response = await GET(
      buildRequest("/api/v1/favourites/units/not-an-id", { token: signToken(USER_ID) }),
      { params: Promise.resolve({ unitId: "not-an-id" }) },
    );

    expect(response.status).toBe(400);
  });
});
