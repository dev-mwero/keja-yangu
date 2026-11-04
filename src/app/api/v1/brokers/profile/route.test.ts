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

import { GET, POST } from "@/app/api/v1/brokers/profile/route";

const { brokerProfile } = getModelStubs();
const USER_ID = makeObjectId("broker");

describe("/api/v1/brokers/profile", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  describe("GET", () => {
    it("returns 401 when unauthenticated", async () => {
      const res = await GET(buildRequest("/api/v1/brokers/profile"));
      expect(res.status).toBe(401);
    });

    it("returns 404 when profile does not exist", async () => {
      brokerProfile.findOne.mockReturnValue(buildQuery(null));
      const res = await GET(buildRequest("/api/v1/brokers/profile", { token: signToken(USER_ID) }));
      expect(res.status).toBe(404);
    });

    it("returns profile for authenticated user", async () => {
      brokerProfile.findOne.mockReturnValue(
        buildQuery({
          userId: USER_ID,
          phone: "+254711223344",
          email: "broker@example.com",
          status: "verified",
        }),
      );
      const res = await GET(buildRequest("/api/v1/brokers/profile", { token: signToken(USER_ID) }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.profile.status).toBe("verified");
    });
  });

  describe("POST", () => {
    it("returns 400 when invalid input is submitted", async () => {
      const res = await POST(
        buildRequest("/api/v1/brokers/profile", {
          method: "POST",
          token: signToken(USER_ID),
          body: { phone: "" },
        }),
      );
      expect(res.status).toBe(400);
    });

    it("upserts profile successfully", async () => {
      brokerProfile.findOne.mockReturnValue(buildQuery(null));
      brokerProfile.create.mockResolvedValue({ _id: "prof-1" });
      brokerProfile.findById.mockReturnValue(
        buildQuery({
          _id: "prof-1",
          userId: USER_ID,
          phone: "+254711223344",
          email: "broker@example.com",
          status: "pending",
        }),
      );

      const res = await POST(
        buildRequest("/api/v1/brokers/profile", {
          method: "POST",
          token: signToken(USER_ID),
          body: {
            phone: "+254711223344",
            email: "broker@example.com",
            agencyName: "Top Realty",
          },
        }),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.profile.userId).toBe(USER_ID);
    });
  });
});
