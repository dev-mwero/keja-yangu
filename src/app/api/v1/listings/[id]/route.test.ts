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
vi.mock("@/models/Lease", () => ({ Lease: getModelStubs().lease }));
vi.mock("@/models/ManagementAssignment", () => ({
  ManagementAssignment: getModelStubs().managementAssignment,
}));
vi.mock("@/models/Listing", () => ({ Listing: getModelStubs().listing }));
vi.mock("@/models/ListingPublisher", () => ({
  ListingPublisher: getModelStubs().listingPublisher,
}));
vi.mock("@/models/AuditEvent", () => ({
  AuditEvent: getModelStubs().auditEvent,
}));

import { DELETE, GET, PATCH } from "@/app/api/v1/listings/[id]/route";

const { user, property, unit, lease, listing, listingPublisher } = getModelStubs();

const ADMIN_ID = makeObjectId("admin");
const PROPERTY_ID = makeObjectId("property");
const UNIT_ID = makeObjectId("unit");
const LISTING_ID = makeObjectId("listing");

async function json(res: Response) {
  return (await res.json()) as Record<string, any>;
}

describe("/api/v1/listings/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  describe("GET", () => {
    it("returns 404 when listing not found", async () => {
      user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "admin" })));
      listing.findOne.mockReturnValue(buildQuery(null));

      const res = await GET(
        buildRequest(`/api/v1/listings/${LISTING_ID}`, {
          token: signToken(ADMIN_ID),
        }),
        { params: Promise.resolve({ id: String(LISTING_ID) }) },
      );

      expect(res.status).toBe(404);
    });

    it("returns listing detail for authorized staff", async () => {
      user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "admin" })));
      listing.findOne.mockReturnValue(
        buildQuery({
          _id: LISTING_ID,
          propertyId: PROPERTY_ID,
          unitId: UNIT_ID,
          state: "draft",
          headline: "Studio Apartment",
        }),
      );
      property.findOne.mockReturnValue(buildQuery({ _id: PROPERTY_ID, ownerId: ADMIN_ID }));
      unit.findById.mockReturnValue(buildQuery({ _id: UNIT_ID, name: "1A" }));
      property.findById.mockReturnValue(buildQuery({ _id: PROPERTY_ID, title: "Plaza" }));
      listingPublisher.find.mockReturnValue(buildQuery([{ shareCode: "kj-testcode1" }]));

      const res = await GET(
        buildRequest(`/api/v1/listings/${LISTING_ID}`, {
          token: signToken(ADMIN_ID),
        }),
        { params: Promise.resolve({ id: String(LISTING_ID) }) },
      );

      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.listing.headline).toBe("Studio Apartment");
      expect(body.unit.name).toBe("1A");
      expect(body.publishers).toHaveLength(1);
    });
  });

  describe("PATCH", () => {
    it("fails with 422 if publish action is run on occupied unit or unit without billing account", async () => {
      user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "admin" })));
      listing.findOne.mockReturnValue(
        buildQuery({
          _id: LISTING_ID,
          propertyId: PROPERTY_ID,
          unitId: UNIT_ID,
          state: "draft",
          askingRent: 20000,
        }),
      );
      property.findOne.mockReturnValue(buildQuery({ _id: PROPERTY_ID, ownerId: ADMIN_ID }));
      unit.findById.mockReturnValue(
        buildQuery({
          _id: UNIT_ID,
          status: "occupied",
          billingAccountId: "",
        }),
      );
      lease.countDocuments.mockResolvedValue(1);

      const res = await PATCH(
        buildRequest(`/api/v1/listings/${LISTING_ID}`, {
          method: "PATCH",
          token: signToken(ADMIN_ID),
          body: { action: "publish" },
        }),
        { params: Promise.resolve({ id: String(LISTING_ID) }) },
      );

      expect(res.status).toBe(422);
      const body = await json(res);
      expect(body.details).toContain("Cannot publish listing for occupied unit");
      expect(body.details).toContain("Unit must have a resolved billing account before publishing");
    });

    it("publishes listing successfully when vacant and billing account resolved", async () => {
      user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "admin" })));
      listing.findOne.mockReturnValue(
        buildQuery({
          _id: LISTING_ID,
          propertyId: PROPERTY_ID,
          unitId: UNIT_ID,
          state: "draft",
          askingRent: 20000,
          version: 1,
        }),
      );
      property.findOne.mockReturnValue(buildQuery({ _id: PROPERTY_ID, ownerId: ADMIN_ID }));
      unit.findById.mockReturnValue(
        buildQuery({
          _id: UNIT_ID,
          status: "available",
          billingAccountId: "ba-123",
          tenantId: [],
        }),
      );
      lease.countDocuments.mockResolvedValue(0);

      listing.findById.mockReturnValue(
        buildQuery({
          _id: LISTING_ID,
          propertyId: PROPERTY_ID,
          unitId: UNIT_ID,
          state: "draft",
          askingRent: 20000,
          version: 1,
        }),
      );
      listing.findOneAndUpdate.mockReturnValue(
        buildQuery({
          _id: LISTING_ID,
          state: "active",
          version: 2,
        }),
      );

      const res = await PATCH(
        buildRequest(`/api/v1/listings/${LISTING_ID}`, {
          method: "PATCH",
          token: signToken(ADMIN_ID),
          body: { action: "publish" },
        }),
        { params: Promise.resolve({ id: String(LISTING_ID) }) },
      );

      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.listing.state).toBe("active");
    });
  });

  describe("DELETE", () => {
    it("soft deletes listing and withdraws it", async () => {
      user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "admin" })));
      listing.findOne.mockReturnValue(
        buildQuery({
          _id: LISTING_ID,
          propertyId: PROPERTY_ID,
          unitId: UNIT_ID,
          state: "draft",
        }),
      );
      property.findOne.mockReturnValue(buildQuery({ _id: PROPERTY_ID, ownerId: ADMIN_ID }));
      listing.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const res = await DELETE(
        buildRequest(`/api/v1/listings/${LISTING_ID}`, {
          method: "DELETE",
          token: signToken(ADMIN_ID),
        }),
        { params: Promise.resolve({ id: String(LISTING_ID) }) },
      );

      expect(res.status).toBe(200);
      expect(listing.updateOne).toHaveBeenCalledWith(
        { _id: String(LISTING_ID) },
        expect.objectContaining({
          $set: expect.objectContaining({ state: "withdrawn" }),
        }),
      );
    });
  });
});
