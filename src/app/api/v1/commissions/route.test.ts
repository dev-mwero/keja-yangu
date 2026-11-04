/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/permissions")>();
  return { ...actual, getAdminAssignmentScope: vi.fn() };
});
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/CommissionAccrual", () => ({
  CommissionAccrual: getModelStubs().commissionAccrual,
}));

import { GET } from "@/app/api/v1/commissions/route";
import { getAdminAssignmentScope } from "@/lib/permissions";

const { user, commissionAccrual } = getModelStubs();
const ADMIN_ID = makeObjectId("admin");
const BROKER_ID = makeObjectId("broker");
const scopeMock = vi.mocked(getAdminAssignmentScope);

describe("GET /api/v1/commissions", () => {
  beforeEach(() => {
    resetModelStubs();
    scopeMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/commissions"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a broker", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: BROKER_ID, role: "broker" })));
    const res = await GET(buildRequest("/api/v1/commissions", { token: signToken(BROKER_ID) }));
    expect(res.status).toBe(403);
  });

  it("returns all accruals for a system admin", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "system-admin" })));
    commissionAccrual.find.mockReturnValue(buildQuery([{ _id: "acc-1" }]));
    commissionAccrual.countDocuments.mockResolvedValue(1);

    const res = await GET(buildRequest("/api/v1/commissions", { token: signToken(ADMIN_ID) }));

    expect(res.status).toBe(200);
    expect(commissionAccrual.find).toHaveBeenCalledWith({});
    expect((await res.json()).pagination.total).toBe(1);
  });

  it("scopes an admin to assigned properties", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "admin" })));
    scopeMock.mockResolvedValue({
      propertyScopeIds: ["prop-1", "prop-2"],
      unitScopeIds: [],
      hasFullPropertyScope: false,
      hasFullUnitScope: false,
      hasUnrestrictedScope: false,
    } as never);
    commissionAccrual.find.mockReturnValue(buildQuery([]));
    commissionAccrual.countDocuments.mockResolvedValue(0);

    await GET(buildRequest("/api/v1/commissions", { token: signToken(ADMIN_ID) }));

    expect(commissionAccrual.find).toHaveBeenCalledWith({
      propertyId: { $in: ["prop-1", "prop-2"] },
    });
  });
});
