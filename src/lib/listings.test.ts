import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canTransitionListing,
  generateListingShareCode,
  markListingLetForUnit,
  toPublicListingProjection,
  transitionListingState,
  validateListingPublish,
} from "@/lib/listings";
import { buildQuery } from "@/test/utils/model-mocks";

const { listingStub, writeAuditEventStub } = vi.hoisted(() => ({
  listingStub: {
    findById: vi.fn(),
    find: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateOne: vi.fn(),
  },
  writeAuditEventStub: vi.fn(),
}));

vi.mock("@/models/Listing", () => ({
  Listing: listingStub,
}));

vi.mock("@/lib/audit", () => ({
  writeAuditEvent: writeAuditEventStub,
}));

describe("listings domain service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("canTransitionListing", () => {
    it("allows identity transition", () => {
      expect(canTransitionListing("draft", "draft")).toBe(true);
      expect(canTransitionListing("active", "active")).toBe(true);
    });

    it("allows valid transitions", () => {
      expect(canTransitionListing("draft", "active")).toBe(true);
      expect(canTransitionListing("draft", "withdrawn")).toBe(true);
      expect(canTransitionListing("active", "paused")).toBe(true);
      expect(canTransitionListing("active", "let")).toBe(true);
      expect(canTransitionListing("active", "withdrawn")).toBe(true);
      expect(canTransitionListing("paused", "active")).toBe(true);
      expect(canTransitionListing("paused", "let")).toBe(true);
      expect(canTransitionListing("let", "draft")).toBe(true);
    });

    it("rejects invalid transitions", () => {
      expect(canTransitionListing("draft", "paused")).toBe(false);
      expect(canTransitionListing("draft", "let")).toBe(false);
      expect(canTransitionListing("withdrawn", "active")).toBe(false);
      expect(canTransitionListing("withdrawn", "draft")).toBe(false);
    });
  });

  describe("generateListingShareCode", () => {
    it("generates deterministic share codes prefixing kj-", () => {
      const code1 = generateListingShareCode("pub-1", "list-1");
      const code2 = generateListingShareCode("pub-1", "list-1");
      const code3 = generateListingShareCode("pub-2", "list-1");

      expect(code1).toBe(code2);
      expect(code1.startsWith("kj-")).toBe(true);
      expect(code1).not.toBe(code3);
    });
  });

  describe("validateListingPublish", () => {
    it("passes validation for vacant unit with rent and billing account", () => {
      const result = validateListingPublish(
        {
          _id: "unit-1",
          status: "available",
          billingAccountId: "ba-123",
          tenantId: [],
        },
        { askingRent: 25000 },
        { activeLeaseCount: 0 },
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("fails when askingRent is zero or negative", () => {
      const result = validateListingPublish(
        { billingAccountId: "ba-123", status: "available" },
        { askingRent: 0 },
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Asking rent must be greater than zero");
    });

    it("fails when unit is occupied or has active lease", () => {
      const occupiedResult = validateListingPublish(
        { billingAccountId: "ba-123", status: "occupied" },
        { askingRent: 25000 },
      );
      expect(occupiedResult.valid).toBe(false);
      expect(occupiedResult.errors).toContain("Cannot publish listing for occupied unit");

      const leaseResult = validateListingPublish(
        { billingAccountId: "ba-123", status: "available" },
        { askingRent: 25000 },
        { activeLeaseCount: 1 },
      );
      expect(leaseResult.valid).toBe(false);
      expect(leaseResult.errors).toContain("Cannot publish listing for occupied unit");
    });

    it("fails when billing account is missing", () => {
      const result = validateListingPublish(
        { billingAccountId: "", status: "available" },
        { askingRent: 25000 },
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Unit must have a resolved billing account before publishing",
      );
    });
  });

  describe("toPublicListingProjection", () => {
    it("whitelists public fields and strips internal data", () => {
      const rawListing = {
        _id: "list-1",
        headline: "Sunny Studio in Kilimani",
        description: "Modern, near Yaya Centre",
        askingRent: 30000,
        serviceCharge: 2500,
        depositMonths: 1,
        availableFrom: new Date("2026-12-01"),
        minimumStayMonths: 6,
        amenities: ["WiFi", "Borehole"],
        media: [{ url: "https://example.com/img1.jpg", isPrimary: true }],
        state: "active" as const,
        internalNotes: "Previous tenant damaged lock",
        canonicalPublisherUserId: "admin-secret-id",
      };

      const rawProperty = {
        _id: "prop-1",
        title: "Kilimani Heights",
        type: "apartment",
        location: "Kilimani, Nairobi",
        ownerId: "landlord-secret-id",
        privateAccountNo: "998877",
      };

      const rawUnit = {
        _id: "unit-1",
        name: "3B",
        floorLevel: 3,
        floorLabel: "3rd Floor",
        beds: 1,
        baths: 1,
        area: 45,
        tenantId: ["tenant-secret-id"],
        billingAccountId: "ba-secret-id",
      };

      const rawPublisher = {
        shareCode: "kj-abcdef1234",
        publisherRole: "admin" as const,
        internalTracking: "agent-k",
      };

      const projection = toPublicListingProjection(rawListing, rawProperty, rawUnit, rawPublisher);

      expect(projection.id).toBe("list-1");
      expect(projection.headline).toBe("Sunny Studio in Kilimani");
      expect(projection.askingRent).toBe(30000);
      expect(projection.property.title).toBe("Kilimani Heights");
      expect(projection.unit.name).toBe("3B");
      expect(projection.publisher?.shareCode).toBe("kj-abcdef1234");

      // Verify no leak of private fields
      expect((projection as any).internalNotes).toBeUndefined();
      expect((projection as any).canonicalPublisherUserId).toBeUndefined();
      expect((projection.property as any).ownerId).toBeUndefined();
      expect((projection.property as any).privateAccountNo).toBeUndefined();
      expect((projection.unit as any).tenantId).toBeUndefined();
      expect((projection.unit as any).billingAccountId).toBeUndefined();
    });
  });

  describe("transitionListingState", () => {
    it("transitions state, bumps version, and records audit event", async () => {
      listingStub.findById.mockReturnValue(
        buildQuery({
          _id: "list-1",
          state: "draft",
          version: 1,
          propertyId: "prop-1",
          blockId: "block-1",
          unitId: "unit-1",
          publishedAt: null,
        }),
      );

      listingStub.findOneAndUpdate.mockReturnValue(
        buildQuery({
          _id: "list-1",
          state: "active",
          version: 2,
          publishedAt: new Date(),
        }),
      );

      const updated = await transitionListingState({
        listingId: "list-1",
        newState: "active",
        actorId: "admin-1",
        actorRole: "admin",
        reason: "Admin approved listing",
      });

      expect(updated.state).toBe("active");
      expect(listingStub.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: "list-1", version: 1 },
        expect.objectContaining({
          $set: expect.objectContaining({ state: "active" }),
          $inc: { version: 1 },
        }),
        { new: true },
      );
      expect(writeAuditEventStub).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "listing.state_transition",
          entityType: "listing",
          entityId: "list-1",
          before: { state: "draft", version: 1 },
          after: expect.objectContaining({ state: "active" }),
        }),
      );
    });

    it("throws if transition is invalid", async () => {
      listingStub.findById.mockReturnValue(
        buildQuery({
          _id: "list-1",
          state: "draft",
          version: 1,
        }),
      );

      await expect(
        transitionListingState({
          listingId: "list-1",
          newState: "let",
          actorId: "admin-1",
        }),
      ).rejects.toThrow("Illegal transition from 'draft' to 'let'");
    });
  });

  describe("markListingLetForUnit", () => {
    it("updates all in-flight listings for the unit to 'let' and logs audit events", async () => {
      listingStub.find.mockReturnValue(
        buildQuery([
          {
            _id: "list-1",
            state: "active",
            propertyId: "prop-1",
            blockId: "block-1",
            unitId: "unit-1",
          },
        ]),
      );

      await markListingLetForUnit("unit-1", "user-123");

      expect(listingStub.updateOne).toHaveBeenCalledWith(
        { _id: "list-1" },
        { $set: { state: "let" }, $inc: { version: 1 } },
      );
      expect(writeAuditEventStub).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "listing.state_transition",
          entityId: "list-1",
          after: { state: "let", reason: "Unit leased/allocated" },
        }),
      );
    });
  });
});
