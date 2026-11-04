/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/BrokerProfile", () => ({
  BrokerProfile: getModelStubs().brokerProfile,
}));
vi.mock("@/models/BrokerAuthorization", () => ({
  BrokerAuthorization: getModelStubs().brokerAuthorization,
}));
vi.mock("@/models/Listing", () => ({ Listing: getModelStubs().listing }));
vi.mock("@/models/ListingPublisher", () => ({
  ListingPublisher: getModelStubs().listingPublisher,
}));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Unit", () => ({ Unit: getModelStubs().unit }));

import { GET } from "@/app/api/v1/brokers/listings/route";

const { brokerProfile, brokerAuthorization, listing, listingPublisher, property, unit } =
  getModelStubs();

const BROKER_ID = makeObjectId("broker");
const PROPERTY_ID = makeObjectId("property");

describe("/api/v1/brokers/listings", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/brokers/listings"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when broker profile is not verified", async () => {
    brokerProfile.findOne.mockReturnValue(buildQuery({ status: "pending" }));
    const res = await GET(
      buildRequest("/api/v1/brokers/listings", { token: signToken(BROKER_ID) }),
    );
    expect(res.status).toBe(403);
  });

  it("returns listings matching broker authorizations", async () => {
    brokerProfile.findOne.mockReturnValue(buildQuery({ status: "verified" }));
    brokerAuthorization.find.mockReturnValue(
      buildQuery([
        {
          brokerId: BROKER_ID,
          scopeType: "property",
          propertyId: PROPERTY_ID,
          scopeId: PROPERTY_ID,
          status: "active",
        },
      ]),
    );

    listing.countDocuments.mockResolvedValue(1);
    listing.find.mockReturnValue(
      buildQuery([
        {
          _id: "list-1",
          propertyId: PROPERTY_ID,
          unitId: "unit-1",
          headline: "Sunny 2BHK",
          askingRent: 45000,
          state: "active",
        },
      ]),
    );

    listingPublisher.find.mockReturnValue(
      buildQuery([
        {
          listingId: "list-1",
          shareCode: "brk_xyz123",
          state: "active",
        },
      ]),
    );

    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID, title: "Grand Heights" }]));
    unit.find.mockReturnValue(buildQuery([{ _id: "unit-1", unitNumber: "A2" }]));

    const res = await GET(
      buildRequest("/api/v1/brokers/listings", { token: signToken(BROKER_ID) }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.listings).toHaveLength(1);
    expect(data.listings[0].headline).toBe("Sunny 2BHK");
    expect(data.listings[0].published).toBe(true);
    expect(data.listings[0].shareCode).toBe("brk_xyz123");
  });
});
