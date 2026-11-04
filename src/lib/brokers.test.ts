import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptCommissionAgreement,
  authorizeBroker,
  canBrokerDistributeListing,
  createBrokerListingPublisher,
  createCommissionAgreement,
  revokeBrokerAuthorization,
  terminateCommissionAgreement,
  toRedactedProspectView,
  upsertBrokerProfile,
  verifyBrokerProfile,
} from "@/lib/brokers";
import { buildQuery } from "@/test/utils/model-mocks";

const {
  brokerProfileStub,
  brokerAuthorizationStub,
  commissionAgreementStub,
  listingStub,
  listingPublisherStub,
  writeAuditEventStub,
} = vi.hoisted(() => ({
  brokerProfileStub: {
    find: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    updateOne: vi.fn(),
  },
  brokerAuthorizationStub: {
    find: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    updateOne: vi.fn(),
  },
  commissionAgreementStub: {
    find: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    updateOne: vi.fn(),
  },
  listingStub: {
    findById: vi.fn(),
  },
  listingPublisherStub: {
    findOne: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  writeAuditEventStub: vi.fn(),
}));

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/audit", () => ({
  writeAuditEvent: writeAuditEventStub,
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

vi.mock("@/models/Listing", () => ({
  Listing: listingStub,
}));

vi.mock("@/models/ListingPublisher", () => ({
  ListingPublisher: listingPublisherStub,
}));

describe("Broker domain services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("BrokerProfile", () => {
    it("creates a new broker profile with status pending", async () => {
      brokerProfileStub.findOne.mockReturnValue(buildQuery(null));
      brokerProfileStub.create.mockResolvedValue({ _id: "prof-1" });
      brokerProfileStub.findById.mockReturnValue(
        buildQuery({
          _id: "prof-1",
          userId: "user-1",
          phone: "+254700111222",
          email: "broker@example.com",
          status: "pending",
        }),
      );

      const res = await upsertBrokerProfile("user-1", {
        phone: "+254700111222",
        email: "broker@example.com",
      });

      expect(res.status).toBe("pending");
      expect(brokerProfileStub.create).toHaveBeenCalled();
    });

    it("updates existing profile and resets rejected to pending", async () => {
      brokerProfileStub.findOne
        .mockReturnValueOnce(
          buildQuery({
            _id: "prof-1",
            userId: "user-1",
            status: "rejected",
            phone: "+254700111222",
            email: "broker@example.com",
          }),
        )
        .mockReturnValueOnce(
          buildQuery({
            _id: "prof-1",
            userId: "user-1",
            status: "pending",
            phone: "+254799999999",
            email: "broker@example.com",
          }),
        );

      brokerProfileStub.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const res = await upsertBrokerProfile("user-1", {
        phone: "+254799999999",
        email: "broker@example.com",
      });

      expect(brokerProfileStub.updateOne).toHaveBeenCalledWith(
        { userId: "user-1" },
        expect.objectContaining({
          $set: expect.objectContaining({ status: "pending", phone: "+254799999999" }),
        }),
      );
      expect(res.status).toBe("pending");
    });

    it("only system-admin can verify broker profile", async () => {
      await expect(
        verifyBrokerProfile("prof-1", { userId: "admin-1", role: "admin" }, "verified"),
      ).rejects.toThrow("Only system administrators");
    });

    it("system-admin can verify broker profile", async () => {
      brokerProfileStub.findById
        .mockReturnValueOnce(buildQuery({ _id: "prof-1", userId: "u-1", status: "pending" }))
        .mockReturnValueOnce(buildQuery({ _id: "prof-1", userId: "u-1", status: "verified" }));
      brokerProfileStub.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const res = await verifyBrokerProfile(
        "prof-1",
        { userId: "sysadmin-1", role: "system-admin" },
        "verified",
        "Documents verified",
      );

      expect(res.status).toBe("verified");
      expect(brokerProfileStub.updateOne).toHaveBeenCalledWith(
        { _id: "prof-1" },
        expect.objectContaining({
          $set: expect.objectContaining({ status: "verified" }),
        }),
      );
    });
  });

  describe("BrokerAuthorization", () => {
    it("fails authorization if broker is not verified", async () => {
      brokerProfileStub.findOne.mockReturnValue(buildQuery({ status: "pending" }));

      await expect(
        authorizeBroker(
          { userId: "sys-1", role: "system-admin" },
          {
            brokerId: "b-1",
            scopeType: "property",
            scopeId: "prop-1",
            propertyId: "prop-1",
          },
        ),
      ).rejects.toThrow("Cannot authorize unverified");
    });

    it("authorizes verified broker when actor is system-admin", async () => {
      brokerProfileStub.findOne.mockReturnValue(buildQuery({ status: "verified" }));
      brokerAuthorizationStub.findOne.mockReturnValue(buildQuery(null));
      brokerAuthorizationStub.create.mockResolvedValue({ _id: "auth-1" });
      brokerAuthorizationStub.findById.mockReturnValue(
        buildQuery({
          _id: "auth-1",
          brokerId: "b-1",
          scopeType: "property",
          scopeId: "prop-1",
          status: "active",
        }),
      );

      const res = await authorizeBroker(
        { userId: "sys-1", role: "system-admin" },
        {
          brokerId: "b-1",
          scopeType: "property",
          scopeId: "prop-1",
          propertyId: "prop-1",
        },
      );

      expect(res.status).toBe("active");
    });

    it("revokes authorization and cascades to active publishers", async () => {
      brokerAuthorizationStub.findById
        .mockReturnValueOnce(
          buildQuery({
            _id: "auth-1",
            propertyId: "prop-1",
            scopeType: "property",
            scopeId: "prop-1",
            status: "active",
          }),
        )
        .mockReturnValueOnce(
          buildQuery({
            _id: "auth-1",
            propertyId: "prop-1",
            scopeType: "property",
            scopeId: "prop-1",
            status: "revoked",
          }),
        );
      brokerAuthorizationStub.updateOne.mockResolvedValue({ modifiedCount: 1 });
      listingPublisherStub.updateMany.mockResolvedValue({ modifiedCount: 2 });

      const res = await revokeBrokerAuthorization(
        { userId: "sys-1", role: "system-admin" },
        "auth-1",
        "Contract ended",
      );

      expect(res.status).toBe("revoked");
      expect(listingPublisherStub.updateMany).toHaveBeenCalledWith(
        { brokerAuthorizationId: "auth-1", state: "active" },
        expect.objectContaining({ $set: expect.objectContaining({ state: "revoked" }) }),
      );
    });
  });

  describe("CommissionAgreement", () => {
    it("creates commission agreement in draft status by default", async () => {
      commissionAgreementStub.create.mockResolvedValue({ _id: "agr-1" });
      commissionAgreementStub.findById.mockReturnValue(
        buildQuery({
          _id: "agr-1",
          brokerId: "b-1",
          basis: "first_month_rent",
          status: "draft",
        }),
      );

      const res = await createCommissionAgreement(
        { userId: "sys-1", role: "system-admin" },
        {
          brokerId: "b-1",
          scopeType: "property",
          scopeId: "prop-1",
          propertyId: "prop-1",
        },
      );

      expect(res.status).toBe("draft");
    });

    it("broker can accept draft agreement belonging to them", async () => {
      commissionAgreementStub.findById
        .mockReturnValueOnce(
          buildQuery({
            _id: "agr-1",
            brokerId: "b-1",
            status: "draft",
          }),
        )
        .mockReturnValueOnce(
          buildQuery({
            _id: "agr-1",
            brokerId: "b-1",
            status: "active",
          }),
        );
      commissionAgreementStub.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const res = await acceptCommissionAgreement("b-1", "agr-1");
      expect(res.status).toBe("active");
    });

    it("terminates commission agreement", async () => {
      commissionAgreementStub.findById
        .mockReturnValueOnce(
          buildQuery({
            _id: "agr-1",
            brokerId: "b-1",
            propertyId: "prop-1",
            scopeType: "property",
            scopeId: "prop-1",
            status: "active",
          }),
        )
        .mockReturnValueOnce(
          buildQuery({
            _id: "agr-1",
            brokerId: "b-1",
            status: "terminated",
          }),
        );
      commissionAgreementStub.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const res = await terminateCommissionAgreement(
        { userId: "sys-1", role: "system-admin" },
        "agr-1",
        "Expired",
      );
      expect(res.status).toBe("terminated");
    });
  });

  describe("Listing distribution & Publisher", () => {
    it("evaluates eligibility correctly", async () => {
      brokerProfileStub.findOne.mockReturnValue(buildQuery({ status: "verified" }));
      listingStub.findById.mockReturnValue(
        buildQuery({
          _id: "list-1",
          unitId: "u-1",
          propertyId: "prop-1",
          state: "active",
        }),
      );
      brokerAuthorizationStub.findOne.mockReturnValue(
        buildQuery({ _id: "auth-1", status: "active" }),
      );
      commissionAgreementStub.findOne.mockReturnValue(
        buildQuery({ _id: "agr-1", status: "active" }),
      );

      const check = await canBrokerDistributeListing("b-1", "list-1");
      expect(check.eligible).toBe(true);
    });

    it("creates broker listing publisher with generated shareCode", async () => {
      brokerProfileStub.findOne.mockReturnValue(buildQuery({ status: "verified" }));
      listingStub.findById.mockReturnValue(
        buildQuery({
          _id: "list-1",
          unitId: "u-1",
          propertyId: "prop-1",
          state: "active",
        }),
      );
      brokerAuthorizationStub.findOne.mockReturnValue(
        buildQuery({ _id: "auth-1", status: "active" }),
      );
      commissionAgreementStub.findOne.mockReturnValue(
        buildQuery({ _id: "agr-1", status: "active" }),
      );

      listingPublisherStub.findOne.mockReturnValue(buildQuery(null));
      listingPublisherStub.create.mockResolvedValue({ _id: "pub-1" });
      listingPublisherStub.findById.mockReturnValue(
        buildQuery({
          _id: "pub-1",
          shareCode: "brk_12345678",
          publisherRole: "broker",
          state: "active",
        }),
      );

      const pub = await createBrokerListingPublisher("b-1", "list-1");
      expect(pub.shareCode).toBe("brk_12345678");
      expect(pub.publisherRole).toBe("broker");
    });
  });

  describe("toRedactedProspectView", () => {
    it("redacts prospect PII and outputs safe projection", () => {
      const prospect = {
        _id: "661234567890abcdef123456",
        applicantName: "Secret Tenant",
        phone: "+254700000000",
        nationalId: "12345678",
        status: "approved",
        unitHeadline: "Deluxe 2BR",
      };

      const redacted = toRedactedProspectView(prospect);
      expect(redacted.referenceCode).toBe("REF-123456");
      expect(redacted.unitHeadline).toBe("Deluxe 2BR");
      expect(redacted.status).toBe("approved");
      expect((redacted as any).phone).toBeUndefined();
      expect((redacted as any).nationalId).toBeUndefined();
      expect((redacted as any).applicantName).toBeUndefined();
    });
  });
});
