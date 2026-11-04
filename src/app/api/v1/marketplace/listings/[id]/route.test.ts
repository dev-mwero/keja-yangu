/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest } from "@/test/utils/api-request";
import { makeObjectId } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/Listing", () => ({ Listing: getModelStubs().listing }));
vi.mock("@/models/ListingPublisher", () => ({
  ListingPublisher: getModelStubs().listingPublisher,
}));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Unit", () => ({ Unit: getModelStubs().unit }));

import { GET } from "@/app/api/v1/marketplace/listings/[id]/route";

const { listing, listingPublisher, property, unit } = getModelStubs();

const PROPERTY_ID = makeObjectId("property");
const UNIT_ID = makeObjectId("unit");
const LISTING_ID = makeObjectId("listing");

async function json(res: Response) {
  return (await res.json()) as Record<string, any>;
}

describe("GET /api/v1/marketplace/listings/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("resolves listing by share code and returns public projection", async () => {
    listingPublisher.findOne.mockReturnValue(
      buildQuery({
        listingId: String(LISTING_ID),
        shareCode: "kj-share123",
        publisherRole: "admin",
        state: "active",
      }),
    );

    listing.findOne.mockReturnValue(
      buildQuery({
        _id: LISTING_ID,
        propertyId: PROPERTY_ID,
        unitId: UNIT_ID,
        state: "active",
        visibility: "public",
        headline: "Sunny Penthouse",
        askingRent: 60000,
      }),
    );

    property.findOne.mockReturnValue(
      buildQuery({
        _id: PROPERTY_ID,
        title: "Sky View Towers",
        location: "Westlands, Nairobi",
        ownerId: "private-owner-id",
      }),
    );

    unit.findOne.mockReturnValue(
      buildQuery({
        _id: UNIT_ID,
        name: "PH1",
        floorLevel: 10,
        beds: 3,
        baths: 3,
        tenantId: ["private-tenant-id"],
      }),
    );

    const res = await GET(buildRequest("/api/v1/marketplace/listings/kj-share123"), {
      params: Promise.resolve({ id: "kj-share123" }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.listing.headline).toBe("Sunny Penthouse");
    expect(body.listing.publisher.shareCode).toBe("kj-share123");
    expect(body.listing.unit.name).toBe("PH1");
    expect(body.listing.property.title).toBe("Sky View Towers");

    // Strictly stripped
    expect(body.listing.property.ownerId).toBeUndefined();
    expect(body.listing.unit.tenantId).toBeUndefined();
  });

  it("returns 404 if listing is not active or not found", async () => {
    listingPublisher.findOne.mockReturnValue(buildQuery(null));
    listing.findOne.mockReturnValue(buildQuery(null));

    const res = await GET(buildRequest(`/api/v1/marketplace/listings/${LISTING_ID}`), {
      params: Promise.resolve({ id: String(LISTING_ID) }),
    });

    expect(res.status).toBe(404);
  });
});
