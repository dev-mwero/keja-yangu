import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bindApplicationAttribution,
  confirmAttributionForLease,
  getBrokerProspects,
  recordProvisionalTouch,
  resolveAttributionDispute,
} from "@/lib/attributions";
import { buildQuery } from "@/test/utils/model-mocks";

const {
  attributionStub,
  listingPublisherStub,
  listingStub,
  brokerProfileStub,
  brokerAuthorizationStub,
  commissionAgreementStub,
  leaseStub,
  applicationStub,
  writeAuditEventStub,
} = vi.hoisted(() => ({
  attributionStub: {
    find: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    updateOne: vi.fn(),
    countDocuments: vi.fn(),
  },
  listingPublisherStub: {
    findOne: vi.fn(),
  },
  listingStub: {
    findById: vi.fn(),
  },
  brokerProfileStub: {
    findOne: vi.fn(),
  },
  brokerAuthorizationStub: {
    findOne: vi.fn(),
  },
  commissionAgreementStub: {
    findOne: vi.fn(),
  },
  leaseStub: {
    findById: vi.fn(),
  },
  applicationStub: {
    find: vi.fn(),
  },
  writeAuditEventStub: vi.fn(),
}));

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/audit", () => ({
  writeAuditEvent: writeAuditEventStub,
}));

vi.mock("@/models/Attribution", () => ({
  Attribution: attributionStub,
}));
vi.mock("@/models/ListingPublisher", () => ({
  ListingPublisher: listingPublisherStub,
}));
vi.mock("@/models/Listing", () => ({
  Listing: listingStub,
}));
vi.mock("@/models/BrokerProfile", () => ({
  BrokerProfile: brokerProfileStub,
}));
vi.mock("@/models/BrokerAuthorization", () => ({
  BrokerAuthorization: brokerAuthorizationStub,
}));
vi.mock("@/models/CommissionAgreement", () => ({
  CommissionAgreement: commissionAgreementStub,
}));
vi.mock("@/models/Lease", () => ({
  Lease: leaseStub,
}));
vi.mock("@/models/Application", () => ({
  Application: applicationStub,
}));

describe("Attribution domain services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recordProvisionalTouch", () => {
    it("returns invalid when shareCode is missing or empty", async () => {
      const res = await recordProvisionalTouch("", "unit-1");
      expect(res.valid).toBe(false);
      expect(res.reason).toBe("Missing shareCode");
    });

    it("returns invalid when shareCode is not found or inactive", async () => {
      listingPublisherStub.findOne.mockReturnValue(buildQuery(null));
      const res = await recordProvisionalTouch("brk_invalid", "unit-1");
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("invalid or inactive");
    });

    it("returns invalid when listing is for a different unit", async () => {
      listingPublisherStub.findOne.mockReturnValue(
        buildQuery({
          listingId: "list-1",
          publisherRole: "admin",
          publisherUserId: "admin-1",
        }),
      );
      listingStub.findById.mockReturnValue(
        buildQuery({
          _id: "list-1",
          unitId: "unit-other",
          state: "active",
        }),
      );

      const res = await recordProvisionalTouch("adm_123", "unit-1");
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("different unit");
    });

    it("validates broker touch successfully when broker has active authorization", async () => {
      listingPublisherStub.findOne.mockReturnValue(
        buildQuery({
          listingId: "list-1",
          publisherRole: "broker",
          publisherUserId: "broker-1",
        }),
      );
      listingStub.findById.mockReturnValue(
        buildQuery({
          _id: "list-1",
          unitId: "unit-1",
          propertyId: "prop-1",
          state: "active",
        }),
      );
      brokerProfileStub.findOne.mockReturnValue(buildQuery({ status: "verified" }));
      brokerAuthorizationStub.findOne.mockReturnValue(
        buildQuery({ _id: "auth-1", status: "active" }),
      );
      commissionAgreementStub.findOne.mockReturnValue(
        buildQuery({ _id: "agr-1", status: "active" }),
      );

      const res = await recordProvisionalTouch("brk_valid", "unit-1");
      expect(res.valid).toBe(true);
      expect(res.source).toBe("broker");
      expect(res.brokerUserId).toBe("broker-1");
      expect(res.commissionAgreementId).toBe("agr-1");
    });
  });

  describe("bindApplicationAttribution", () => {
    it("returns existing locked attribution if already bound", async () => {
      attributionStub.findOne.mockReturnValue(
        buildQuery({
          _id: "attr-existing",
          applicationId: "app-1",
          status: "locked",
        }),
      );

      const res = await bindApplicationAttribution({
        applicationId: "app-1",
        unitId: "unit-1",
        propertyId: "prop-1",
      });

      expect(res._id).toBe("attr-existing");
      expect(attributionStub.create).not.toHaveBeenCalled();
    });

    it("creates locked direct attribution when no shareCode is passed", async () => {
      attributionStub.findOne.mockReturnValue(buildQuery(null));
      attributionStub.create.mockResolvedValue({ _id: "attr-new" });
      attributionStub.findById.mockReturnValue(
        buildQuery({
          _id: "attr-new",
          applicationId: "app-1",
          source: "direct",
          status: "locked",
        }),
      );

      const res = await bindApplicationAttribution({
        applicationId: "app-1",
        unitId: "unit-1",
        propertyId: "prop-1",
      });

      expect(res.source).toBe("direct");
      expect(res.status).toBe("locked");
      expect(attributionStub.create).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationId: "app-1",
          source: "direct",
          status: "locked",
        }),
      );
    });
  });

  describe("confirmAttributionForLease", () => {
    it("confirms locked attribution by applicationId", async () => {
      attributionStub.findOne.mockReturnValue(
        buildQuery({
          _id: "attr-1",
          applicationId: "app-1",
          status: "locked",
          propertyId: "prop-1",
          unitId: "unit-1",
        }),
      );
      attributionStub.updateOne.mockResolvedValue({ modifiedCount: 1 });
      attributionStub.findById.mockReturnValue(
        buildQuery({
          _id: "attr-1",
          status: "confirmed",
          leaseId: "lease-1",
          confirmedAt: new Date(),
        }),
      );

      const res = await confirmAttributionForLease("unit-1", "lease-1", "app-1");
      expect(res.status).toBe("confirmed");
      expect(res.leaseId).toBe("lease-1");
      expect(attributionStub.updateOne).toHaveBeenCalledWith(
        { _id: "attr-1" },
        expect.objectContaining({
          $set: expect.objectContaining({ status: "confirmed", leaseId: "lease-1" }),
        }),
      );
    });

    it("creates direct confirmed attribution if no locked attribution exists", async () => {
      attributionStub.findOne.mockReturnValue(buildQuery(null));
      leaseStub.findById.mockReturnValue(buildQuery({ _id: "lease-1", propertyId: "prop-1" }));
      attributionStub.create.mockResolvedValue({ _id: "attr-direct" });
      attributionStub.findById.mockReturnValue(
        buildQuery({
          _id: "attr-direct",
          status: "confirmed",
          source: "direct",
          leaseId: "lease-1",
        }),
      );

      const res = await confirmAttributionForLease("unit-1", "lease-1");
      expect(res.status).toBe("confirmed");
      expect(res.source).toBe("direct");
      expect(attributionStub.create).toHaveBeenCalled();
    });
  });

  describe("resolveAttributionDispute", () => {
    it("fails when caller is not system-admin", async () => {
      await expect(
        resolveAttributionDispute({ userId: "admin-1", role: "admin" }, "attr-1", {
          reason: "Disputed",
        }),
      ).rejects.toThrow("Only system administrators");
    });

    it("creates superseding attribution and marks original disputed", async () => {
      attributionStub.findById
        .mockReturnValueOnce(
          buildQuery({
            _id: "attr-1",
            applicationId: "app-1",
            leaseId: "lease-1",
            unitId: "unit-1",
            propertyId: "prop-1",
            status: "confirmed",
            brokerUserId: "broker-orig",
          }),
        )
        .mockReturnValueOnce(
          buildQuery({
            _id: "attr-2-superseding",
            brokerUserId: "broker-new",
            status: "confirmed",
          }),
        )
        .mockReturnValueOnce(
          buildQuery({
            _id: "attr-1",
            status: "disputed",
            supersededByAttributionId: "attr-2-superseding",
          }),
        );

      attributionStub.create.mockResolvedValue({ _id: "attr-2-superseding" });
      attributionStub.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const res = await resolveAttributionDispute(
        { userId: "sys-1", role: "system-admin" },
        "attr-1",
        {
          newBrokerUserId: "broker-new",
          reason: "Prior touch verified on appeal",
        },
      );

      expect(res.original.status).toBe("disputed");
      expect(res.superseding.brokerUserId).toBe("broker-new");
      expect(attributionStub.updateOne).toHaveBeenCalledWith(
        { _id: "attr-1" },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: "disputed",
            supersededByAttributionId: "attr-2-superseding",
          }),
        }),
      );
    });
  });

  describe("getBrokerProspects", () => {
    it("returns paginated and redacted prospects", async () => {
      attributionStub.countDocuments.mockResolvedValue(1);
      attributionStub.find.mockReturnValue(
        buildQuery([
          {
            _id: "attr-1",
            applicationId: "66112233445566778899aabb",
            brokerUserId: "broker-1",
            unitId: "u-1001",
            status: "locked",
            lockedAt: new Date("2026-11-01"),
          },
        ]),
      );

      applicationStub.find.mockReturnValue(
        buildQuery([
          {
            _id: "66112233445566778899aabb",
            applicantName: "Private Tenant",
            phone: "+254700000000",
            status: "pending",
          },
        ]),
      );

      const res = await getBrokerProspects("broker-1", { page: 1, limit: 10 });
      expect(res.pagination.total).toBe(1);
      expect(res.prospects).toHaveLength(1);
      expect(res.prospects[0].referenceCode).toBe("REF-99AABB");
      expect((res.prospects[0] as any).phone).toBeUndefined();
      expect((res.prospects[0] as any).applicantName).toBeUndefined();
    });
  });
});
