/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

const { getBrokerProspectsMock } = vi.hoisted(() => ({
  getBrokerProspectsMock: vi.fn(),
}));

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/attributions", () => ({
  getBrokerProspects: getBrokerProspectsMock,
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/BrokerProfile", () => ({ BrokerProfile: getModelStubs().brokerProfile }));

import { GET } from "@/app/api/v1/brokers/prospects/route";

const { user, brokerProfile } = getModelStubs();
const BROKER_ID = makeObjectId("broker");
const TENANT_ID = makeObjectId("tenant");

describe("GET /api/v1/brokers/prospects", () => {
  beforeEach(() => {
    resetModelStubs();
    getBrokerProspectsMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/brokers/prospects"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-broker role", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_ID, role: "tenant" })));
    const res = await GET(
      buildRequest("/api/v1/brokers/prospects", { token: signToken(TENANT_ID) }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when the broker profile is not verified", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: BROKER_ID, role: "broker" })));
    brokerProfile.findOne.mockReturnValue(buildQuery({ status: "pending" }));
    const res = await GET(
      buildRequest("/api/v1/brokers/prospects", { token: signToken(BROKER_ID) }),
    );
    expect(res.status).toBe(403);
  });

  it("returns redacted prospects for a verified broker", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: BROKER_ID, role: "broker" })));
    brokerProfile.findOne.mockReturnValue(buildQuery({ status: "verified" }));
    getBrokerProspectsMock.mockResolvedValue({
      prospects: [{ id: "app-1", referenceCode: "REF-APP001", status: "pending" }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    const res = await GET(
      buildRequest("/api/v1/brokers/prospects", { token: signToken(BROKER_ID) }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.prospects).toHaveLength(1);
    expect(getBrokerProspectsMock).toHaveBeenCalledWith(BROKER_ID, { page: 1, limit: 10 });
  });
});
