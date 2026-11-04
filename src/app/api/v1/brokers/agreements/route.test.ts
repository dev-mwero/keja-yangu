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
vi.mock("@/models/CommissionAgreement", () => ({
  CommissionAgreement: getModelStubs().commissionAgreement,
}));

import { GET, POST } from "@/app/api/v1/brokers/agreements/route";

const { user, commissionAgreement } = getModelStubs();
const ADMIN_ID = makeObjectId("admin");
const BROKER_ID = makeObjectId("broker");
const PROPERTY_ID = makeObjectId("property");

describe("/api/v1/brokers/agreements", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  describe("GET", () => {
    it("returns 401 when unauthenticated", async () => {
      const res = await GET(buildRequest("/api/v1/brokers/agreements"));
      expect(res.status).toBe(401);
    });

    it("restricts broker to their own agreements", async () => {
      user.findById.mockReturnValue(buildQuery(makeUser({ _id: BROKER_ID, role: "broker" })));
      commissionAgreement.find.mockReturnValue(
        buildQuery([
          {
            _id: "agr-1",
            brokerId: BROKER_ID,
            basis: "first_month_rent",
            status: "active",
          },
        ]),
      );

      const res = await GET(
        buildRequest("/api/v1/brokers/agreements", { token: signToken(BROKER_ID) }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.agreements).toHaveLength(1);
      expect(commissionAgreement.find).toHaveBeenCalledWith(
        expect.objectContaining({ brokerId: BROKER_ID }),
      );
    });
  });

  describe("POST", () => {
    it("creates agreement for system-admin", async () => {
      user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "system-admin" })));
      commissionAgreement.create.mockResolvedValue({ _id: "agr-1" });
      commissionAgreement.findById.mockReturnValue(
        buildQuery({
          _id: "agr-1",
          brokerId: BROKER_ID,
          scopeType: "property",
          scopeId: PROPERTY_ID,
          basis: "first_month_rent",
          status: "draft",
        }),
      );

      const res = await POST(
        buildRequest("/api/v1/brokers/agreements", {
          method: "POST",
          token: signToken(ADMIN_ID),
          body: {
            brokerId: BROKER_ID,
            scopeType: "property",
            scopeId: PROPERTY_ID,
            propertyId: PROPERTY_ID,
            basis: "first_month_rent",
          },
        }),
      );

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.agreement.status).toBe("draft");
    });
  });
});
