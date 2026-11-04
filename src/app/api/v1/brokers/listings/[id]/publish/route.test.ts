/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/audit", () => ({
  writeAuditEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/BrokerProfile", () => ({
  BrokerProfile: getModelStubs().brokerProfile,
}));
vi.mock("@/models/BrokerAuthorization", () => ({
  BrokerAuthorization: getModelStubs().brokerAuthorization,
}));
vi.mock("@/models/CommissionAgreement", () => ({
  CommissionAgreement: getModelStubs().commissionAgreement,
}));
vi.mock("@/models/Listing", () => ({ Listing: getModelStubs().listing }));
vi.mock("@/models/ListingPublisher", () => ({
  ListingPublisher: getModelStubs().listingPublisher,
}));

import { POST } from "@/app/api/v1/brokers/listings/[id]/publish/route";

const { brokerProfile, brokerAuthorization, commissionAgreement, listing, listingPublisher } =
  getModelStubs();

const BROKER_ID = makeObjectId("broker");
const PROPERTY_ID = makeObjectId("property");

describe("/api/v1/brokers/listings/[id]/publish", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await POST(
      buildRequest("/api/v1/brokers/listings/list-1/publish", { method: "POST" }),
      { params: Promise.resolve({ id: "list-1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("creates broker publisher and returns share URL", async () => {
    brokerProfile.findOne.mockReturnValue(buildQuery({ status: "verified" }));
    listing.findById.mockReturnValue(
      buildQuery({
        _id: "list-1",
        unitId: "u-1",
        propertyId: PROPERTY_ID,
        state: "active",
      }),
    );
    brokerAuthorization.findOne.mockReturnValue(buildQuery({ _id: "auth-1", status: "active" }));
    commissionAgreement.findOne.mockReturnValue(buildQuery({ _id: "agr-1", status: "active" }));

    listingPublisher.findOne.mockReturnValue(buildQuery(null));
    listingPublisher.create.mockResolvedValue({ _id: "pub-1" });
    listingPublisher.findById.mockReturnValue(
      buildQuery({
        _id: "pub-1",
        shareCode: "brk_test123",
        publisherRole: "broker",
        state: "active",
      }),
    );

    const res = await POST(
      buildRequest("/api/v1/brokers/listings/list-1/publish", {
        method: "POST",
        token: signToken(BROKER_ID),
      }),
      { params: Promise.resolve({ id: "list-1" }) },
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.shareUrl).toBe("/marketplace/list-1?ref=brk_test123");
  });
});
