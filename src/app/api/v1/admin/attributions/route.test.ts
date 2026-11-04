/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Attribution", () => ({ Attribution: getModelStubs().attribution }));

import { GET } from "@/app/api/v1/admin/attributions/route";

const { user, attribution } = getModelStubs();
const SYS_ADMIN_ID = makeObjectId("sysadmin");
const BROKER_ID = makeObjectId("broker");

describe("GET /api/v1/admin/attributions", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/admin/attributions"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a broker", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: BROKER_ID, role: "broker" })));
    const res = await GET(
      buildRequest("/api/v1/admin/attributions", { token: signToken(BROKER_ID) }),
    );
    expect(res.status).toBe(403);
  });

  it("returns all attributions for a system admin", async () => {
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: SYS_ADMIN_ID, role: "system-admin" })),
    );
    attribution.find.mockReturnValue(
      buildQuery([
        {
          _id: "attr-1",
          unitId: "unit-1",
          propertyId: "prop-1",
          source: "broker",
          status: "confirmed",
        },
      ]),
    );
    attribution.countDocuments.mockResolvedValue(1);

    const res = await GET(
      buildRequest("/api/v1/admin/attributions", { token: signToken(SYS_ADMIN_ID) }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.pagination.total).toBe(1);
  });

  it("filters by status when requested", async () => {
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: SYS_ADMIN_ID, role: "system-admin" })),
    );
    attribution.find.mockReturnValue(buildQuery([]));
    attribution.countDocuments.mockResolvedValue(0);

    await GET(
      buildRequest("/api/v1/admin/attributions", {
        token: signToken(SYS_ADMIN_ID),
        query: { status: "disputed" },
      }),
    );

    expect(attribution.find).toHaveBeenCalledWith({ status: "disputed" });
  });
});
