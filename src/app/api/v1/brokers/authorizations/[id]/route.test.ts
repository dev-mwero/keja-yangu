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
vi.mock("@/models/BrokerAuthorization", () => ({
  BrokerAuthorization: getModelStubs().brokerAuthorization,
}));
vi.mock("@/models/ListingPublisher", () => ({
  ListingPublisher: getModelStubs().listingPublisher,
}));

import { PATCH } from "@/app/api/v1/brokers/authorizations/[id]/route";

const { user, brokerAuthorization, listingPublisher } = getModelStubs();
const ADMIN_ID = makeObjectId("admin");

describe("/api/v1/brokers/authorizations/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await PATCH(
      buildRequest("/api/v1/brokers/authorizations/auth-1", {
        method: "PATCH",
        body: { status: "revoked" },
      }),
      { params: Promise.resolve({ id: "auth-1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("revokes authorization and cascades to publishers", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "system-admin" })));
    brokerAuthorization.findById
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
    brokerAuthorization.updateOne.mockResolvedValue({ modifiedCount: 1 });
    listingPublisher.updateMany.mockResolvedValue({ modifiedCount: 1 });

    const res = await PATCH(
      buildRequest("/api/v1/brokers/authorizations/auth-1", {
        method: "PATCH",
        token: signToken(ADMIN_ID),
        body: { status: "revoked", reason: "End of contract" },
      }),
      { params: Promise.resolve({ id: "auth-1" }) },
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.authorization.status).toBe("revoked");
  });
});
