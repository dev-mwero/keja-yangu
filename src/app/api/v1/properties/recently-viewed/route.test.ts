/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeProperty } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/PropertyView", () => ({ PropertyView: getModelStubs().propertyView }));

import { GET } from "@/app/api/v1/properties/recently-viewed/route";

const { property, propertyView } = getModelStubs();
const USER_ID = makeObjectId("view-user");
const PROPERTY_ID = makeObjectId("view-property");

describe("GET /api/v1/properties/recently-viewed", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("returns each recently viewed public property once", async () => {
    const viewedAt = new Date("2026-05-01T10:00:00Z");
    propertyView.find.mockReturnValue(buildQuery([{ propertyId: PROPERTY_ID, viewedAt }]));
    property.find.mockReturnValue(buildQuery([makeProperty({ _id: PROPERTY_ID })]));

    const response = await GET(
      buildRequest("/api/v1/properties/recently-viewed", { token: signToken(USER_ID) }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ _id: PROPERTY_ID, viewedAt: viewedAt.toISOString() });
    expect(property.find).toHaveBeenCalledWith({
      _id: { $in: [PROPERTY_ID] },
      status: "available",
      published: true,
      deletedAt: null,
    });
  });
});
