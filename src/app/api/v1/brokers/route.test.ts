/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/BrokerProfile", () => ({
  BrokerProfile: getModelStubs().brokerProfile,
}));

import { GET } from "@/app/api/v1/brokers/route";

const { user, brokerProfile } = getModelStubs();
const ADMIN_ID = makeObjectId("admin");

describe("/api/v1/brokers", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  describe("GET", () => {
    it("returns 401 when unauthenticated", async () => {
      const res = await GET(buildRequest("/api/v1/brokers"));
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is not admin", async () => {
      user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "tenant" })));
      const res = await GET(buildRequest("/api/v1/brokers", { token: signToken(ADMIN_ID) }));
      expect(res.status).toBe(403);
    });

    it("returns broker list for admin", async () => {
      user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "admin" })));
      brokerProfile.countDocuments.mockResolvedValue(1);
      brokerProfile.find.mockReturnValue(
        buildQuery([
          {
            _id: "prof-1",
            userId: "broker-1",
            agencyName: "Quick Homes",
            status: "verified",
          },
        ]),
      );

      const res = await GET(buildRequest("/api/v1/brokers", { token: signToken(ADMIN_ID) }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.brokers).toHaveLength(1);
      expect(data.brokers[0].agencyName).toBe("Quick Homes");
    });
  });
});

