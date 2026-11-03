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
vi.mock("@/models/BrokerAuthorization", () => ({
  BrokerAuthorization: getModelStubs().brokerAuthorization,
}));

import { GET, POST } from "@/app/api/v1/brokers/authorizations/route";

const { user, brokerProfile, brokerAuthorization } = getModelStubs();
const ADMIN_ID = makeObjectId("admin");
const BROKER_ID = makeObjectId("broker");
const PROPERTY_ID = makeObjectId("property");

describe("/api/v1/brokers/authorizations", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  describe("GET", () => {
    it("returns 401 when unauthenticated", async () => {
      const res = await GET(buildRequest("/api/v1/brokers/authorizations"));
      expect(res.status).toBe(401);
    });

    it("restricts broker to their own authorizations", async () => {
      user.findById.mockReturnValue(buildQuery(makeUser({ _id: BROKER_ID, role: "broker" })));
      brokerAuthorization.find.mockReturnValue(
        buildQuery([
          {
            _id: "auth-1",
            brokerId: BROKER_ID,
            propertyId: PROPERTY_ID,
            status: "active",
          },
        ]),
      );

      const res = await GET(
        buildRequest("/api/v1/brokers/authorizations", { token: signToken(BROKER_ID) }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.authorizations).toHaveLength(1);
      expect(brokerAuthorization.find).toHaveBeenCalledWith(
        expect.objectContaining({ brokerId: BROKER_ID }),
      );
    });
  });

  describe("POST", () => {
    it("returns 403 when user is broker or tenant", async () => {
      user.findById.mockReturnValue(buildQuery(makeUser({ _id: BROKER_ID, role: "broker" })));
      const res = await POST(
        buildRequest("/api/v1/brokers/authorizations", {
          method: "POST",
          token: signToken(BROKER_ID),
          body: {
            brokerId: BROKER_ID,
            scopeType: "property",
            scopeId: PROPERTY_ID,
            propertyId: PROPERTY_ID,
          },
        }),
      );
      expect(res.status).toBe(403);
    });

    it("creates authorization for system-admin", async () => {
      user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "system-admin" })));
      brokerProfile.findOne.mockReturnValue(buildQuery({ status: "verified" }));
      brokerAuthorization.findOne.mockReturnValue(buildQuery(null));
      brokerAuthorization.create.mockResolvedValue({ _id: "auth-1" });
      brokerAuthorization.findById.mockReturnValue(
        buildQuery({
          _id: "auth-1",
          brokerId: BROKER_ID,
          scopeType: "property",
          scopeId: PROPERTY_ID,
          status: "active",
        }),
      );

      const res = await POST(
        buildRequest("/api/v1/brokers/authorizations", {
          method: "POST",
          token: signToken(ADMIN_ID),
          body: {
            brokerId: BROKER_ID,
            scopeType: "property",
            scopeId: PROPERTY_ID,
            propertyId: PROPERTY_ID,
          },
        }),
      );

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.authorization.status).toBe("active");
    });
  });
});

