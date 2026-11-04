/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Unit", () => ({ Unit: getModelStubs().unit }));
vi.mock("@/models/ManagementAssignment", () => ({
  ManagementAssignment: getModelStubs().managementAssignment,
}));
vi.mock("@/models/Listing", () => ({ Listing: getModelStubs().listing }));
vi.mock("@/models/ListingPublisher", () => ({
  ListingPublisher: getModelStubs().listingPublisher,
}));

import { GET, POST } from "@/app/api/v1/listings/route";

const { user, property, unit, managementAssignment, listing, listingPublisher } = getModelStubs();

const ADMIN_ID = makeObjectId("admin");
const PROPERTY_ID = makeObjectId("property");
const UNIT_ID = makeObjectId("unit");

async function json(res: Response) {
  return (await res.json()) as Record<string, any>;
}

describe("/api/v1/listings", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  describe("GET", () => {
    it("returns 401 when unauthenticated", async () => {
      const res = await GET(buildRequest("/api/v1/listings"));
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is not admin, owner, or system-admin", async () => {
      user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "tenant" })));
      const res = await GET(buildRequest("/api/v1/listings", { token: signToken(ADMIN_ID) }));
      expect(res.status).toBe(403);
    });

    it("returns listings scoped to admin's properties", async () => {
      user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "admin" })));
      property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID }]));
      managementAssignment.find.mockReturnValue(buildQuery([]));
      listing.countDocuments.mockResolvedValue(1);
      listing.find.mockReturnValue(
        buildQuery([
          {
            _id: "list-1",
            propertyId: PROPERTY_ID,
            headline: "Cozy 1BHK",
            state: "draft",
          },
        ]),
      );

      const res = await GET(buildRequest("/api/v1/listings", { token: signToken(ADMIN_ID) }));
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].headline).toBe("Cozy 1BHK");
    });
  });

  describe("POST", () => {
    it("returns 401 when unauthenticated", async () => {
      const res = await POST(
        buildRequest("/api/v1/listings", {
          method: "POST",
          body: { headline: "Studio" },
        }),
      );
      expect(res.status).toBe(401);
    });

    it("creates a draft listing and initial publisher record", async () => {
      user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "admin" })));
      property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID }]));
      managementAssignment.find.mockReturnValue(buildQuery([]));
      unit.findOne.mockReturnValue(
        buildQuery({
          _id: UNIT_ID,
          propertyId: PROPERTY_ID,
          blockId: "block-1",
          serviceCharge: 1500,
        }),
      );
      listing.findOne.mockReturnValue(buildQuery(null));
      listing.create.mockResolvedValue({
        _id: "list-new",
        propertyId: PROPERTY_ID,
        unitId: UNIT_ID,
        headline: "Modern 2BHK Apartment",
        askingRent: 35000,
        state: "draft",
      });
      listingPublisher.create.mockResolvedValue({
        _id: "pub-1",
        listingId: "list-new",
        publisherUserId: ADMIN_ID,
        publisherRole: "admin",
        shareCode: "kj-testcode1",
        state: "active",
      });

      const res = await POST(
        buildRequest("/api/v1/listings", {
          method: "POST",
          token: signToken(ADMIN_ID),
          body: {
            propertyId: PROPERTY_ID,
            unitId: UNIT_ID,
            headline: "Modern 2BHK Apartment",
            askingRent: 35000,
          },
        }),
      );

      expect(res.status).toBe(201);
      const body = await json(res);
      expect(body.listing._id).toBe("list-new");
      expect(body.publisher.shareCode).toBe("kj-testcode1");
      expect(listing.create).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyId: PROPERTY_ID,
          unitId: UNIT_ID,
          state: "draft",
          askingRent: 35000,
        }),
      );
    });

    it("returns 409 if an active or draft listing already exists for the unit", async () => {
      user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "admin" })));
      property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID }]));
      managementAssignment.find.mockReturnValue(buildQuery([]));
      unit.findOne.mockReturnValue(buildQuery({ _id: UNIT_ID, propertyId: PROPERTY_ID }));
      listing.findOne.mockReturnValue(buildQuery({ _id: "existing-list", state: "active" }));

      const res = await POST(
        buildRequest("/api/v1/listings", {
          method: "POST",
          token: signToken(ADMIN_ID),
          body: {
            propertyId: PROPERTY_ID,
            unitId: UNIT_ID,
            headline: "Duplicate Listing",
            askingRent: 35000,
          },
        }),
      );

      expect(res.status).toBe(409);
      const body = await json(res);
      expect(body.error).toContain("already exists");
    });
  });
});
