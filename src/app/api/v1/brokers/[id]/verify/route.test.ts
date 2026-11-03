/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/audit", () => ({
  writeAuditEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/BrokerProfile", () => ({
  BrokerProfile: getModelStubs().brokerProfile,
}));
vi.mock("@/models/ListingPublisher", () => ({
  ListingPublisher: getModelStubs().listingPublisher,
}));

import { POST } from "@/app/api/v1/brokers/[id]/verify/route";

const { user, brokerProfile } = getModelStubs();
const ADMIN_ID = makeObjectId("admin");
const SYS_ADMIN_ID = makeObjectId("sysadmin");

describe("/api/v1/brokers/[id]/verify", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await POST(
      buildRequest("/api/v1/brokers/prof-1/verify", {
        method: "POST",
        body: { decision: "verified" },
      }),
      { params: Promise.resolve({ id: "prof-1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not system-admin", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "admin" })));
    const res = await POST(
      buildRequest("/api/v1/brokers/prof-1/verify", {
        method: "POST",
        token: signToken(ADMIN_ID),
        body: { decision: "verified" },
      }),
      { params: Promise.resolve({ id: "prof-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("verifies broker profile successfully when caller is system-admin", async () => {
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: SYS_ADMIN_ID, role: "system-admin" })),
    );
    brokerProfile.findById
      .mockReturnValueOnce(buildQuery({ _id: "prof-1", userId: "u-1", status: "pending" }))
      .mockReturnValueOnce(buildQuery({ _id: "prof-1", userId: "u-1", status: "verified" }));
    brokerProfile.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const res = await POST(
      buildRequest("/api/v1/brokers/prof-1/verify", {
        method: "POST",
        token: signToken(SYS_ADMIN_ID),
        body: { decision: "verified", notes: "Approved" },
      }),
      { params: Promise.resolve({ id: "prof-1" }) },
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.profile.status).toBe("verified");
  });
});
