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

import { GET } from "@/app/api/v1/marketplace/listings/route";

const { listing, listingPublisher, property, unit } = getModelStubs();

const PROPERTY_ID = makeObjectId("property");
const UNIT_ID = makeObjectId("unit");
const LISTING_ID = makeObjectId("listing");

async function json(res: Response) {
  return (await res.json()) as Record<string, any>;
}

describe("GET /api/v1/marketplace/listings", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("returns public listings with safe projections (no tenant or internal notes)", async () => {
    listing.countDocuments.mockResolvedValue(1);
    listing.find.mockReturnValue(
      buildQuery([
        {
          _id: LISTING_ID,
          propertyId: PROPERTY_ID,
          unitId: UNIT_ID,
          state: "active",
          headline: "Modern 2BHK Kilimani",
          description: "Near junction",
          askingRent: 40000,
          serviceCharge: 2000,
          depositMonths: 1,
          availableFrom: new Date(),
          amenities: ["WiFi"],
          media: [],
          internalAdminNotes: "Secret note",
        },
      ]),
    );

    property.find.mockReturnValue(
      buildQuery([
        {
          _id: PROPERTY_ID,
          title: "Kilimani Heights",
          location: "Kilimani, Nairobi",
          type: "apartment",
          ownerId: "landlord-secret-id",
        },
      ]),
    );

    unit.find.mockReturnValue(
      buildQuery([
        {
          _id: UNIT_ID,
          name: "4A",
          floorLevel: 4,
          beds: 2,
          baths: 2,
          area: 75,
          tenantId: ["tenant-private-id"],
          billingAccountId: "ba-private-id",
        },
      ]),
    );

    listingPublisher.find.mockReturnValue(
      buildQuery([
        {
          listingId: LISTING_ID,
          shareCode: "kj-public-code",
          publisherRole: "admin",
          state: "active",
        },
      ]),
    );

    const res = await GET(buildRequest("/api/v1/marketplace/listings"));
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.listings).toHaveLength(1);
    const item = body.listings[0];

    expect(item.id).toBe(String(LISTING_ID));
    expect(item.headline).toBe("Modern 2BHK Kilimani");
    expect(item.askingRent).toBe(40000);
    expect(item.property.title).toBe("Kilimani Heights");
    expect(item.unit.name).toBe("4A");
    expect(item.publisher.shareCode).toBe("kj-public-code");

    // Critical: check that no private landlord/tenant/account fields leaked
    expect(item.internalAdminNotes).toBeUndefined();
    expect(item.property.ownerId).toBeUndefined();
    expect(item.unit.tenantId).toBeUndefined();
    expect(item.unit.billingAccountId).toBeUndefined();
  });
});
