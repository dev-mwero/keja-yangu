/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/BrokerProfile", () => ({ BrokerProfile: getModelStubs().brokerProfile }));
vi.mock("@/models/CommissionAccrual", () => ({
  CommissionAccrual: getModelStubs().commissionAccrual,
}));

import { GET } from "@/app/api/v1/brokers/commissions/route";

const { user, brokerProfile, commissionAccrual } = getModelStubs();
const BROKER_ID = makeObjectId("broker");

describe("GET /api/v1/brokers/commissions", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/brokers/commissions"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-broker", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: BROKER_ID, role: "tenant" })));
    const res = await GET(
      buildRequest("/api/v1/brokers/commissions", { token: signToken(BROKER_ID) }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 until the broker profile is verified", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: BROKER_ID, role: "broker" })));
    brokerProfile.findOne.mockReturnValue(buildQuery({ status: "pending" }));
    const res = await GET(
      buildRequest("/api/v1/brokers/commissions", { token: signToken(BROKER_ID) }),
    );
    expect(res.status).toBe(403);
  });

  it("returns only the broker's own accruals", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: BROKER_ID, role: "broker" })));
    brokerProfile.findOne.mockReturnValue(buildQuery({ status: "verified" }));
    commissionAccrual.find.mockReturnValue(
      buildQuery([{ _id: "acc-1", brokerUserId: BROKER_ID, netMinor: 25_000 }]),
    );
    commissionAccrual.countDocuments.mockResolvedValue(1);

    const res = await GET(
      buildRequest("/api/v1/brokers/commissions", {
        token: signToken(BROKER_ID),
        query: { status: "eligible" },
      }),
    );

    expect(res.status).toBe(200);
    expect(commissionAccrual.find).toHaveBeenCalledWith({
      brokerUserId: BROKER_ID,
      status: "eligible",
    });
    const json = await res.json();
    expect(json.data).toHaveLength(1);
  });
});
