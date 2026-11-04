/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

const { approveAccrualMock } = vi.hoisted(() => ({ approveAccrualMock: vi.fn() }));

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/commission", () => ({ approveAccrual: approveAccrualMock }));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));

import { POST } from "@/app/api/v1/commissions/[id]/approve/route";

const { user } = getModelStubs();
const ADMIN_ID = makeObjectId("admin");
const BROKER_ID = makeObjectId("broker");
const ACCRUAL_ID = makeObjectId("accrual");

describe("POST /api/v1/commissions/[id]/approve", () => {
  beforeEach(() => {
    resetModelStubs();
    approveAccrualMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await POST(
      buildRequest(`/api/v1/commissions/${ACCRUAL_ID}/approve`, { method: "POST" }),
      withParams(ACCRUAL_ID),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for a broker", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: BROKER_ID, role: "broker" })));
    const res = await POST(
      buildRequest(`/api/v1/commissions/${ACCRUAL_ID}/approve`, {
        method: "POST",
        token: signToken(BROKER_ID),
      }),
      withParams(ACCRUAL_ID),
    );
    expect(res.status).toBe(403);
  });

  it("approves an eligible accrual as an admin", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "admin" })));
    approveAccrualMock.mockResolvedValue({ _id: ACCRUAL_ID, status: "approved" });

    const res = await POST(
      buildRequest(`/api/v1/commissions/${ACCRUAL_ID}/approve`, {
        method: "POST",
        token: signToken(ADMIN_ID),
      }),
      withParams(ACCRUAL_ID),
    );

    expect(res.status).toBe(200);
    expect(approveAccrualMock).toHaveBeenCalledWith(
      { userId: ADMIN_ID, role: "admin" },
      ACCRUAL_ID,
    );
    expect((await res.json()).data.status).toBe("approved");
  });

  it("maps a missing accrual to 404", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "admin" })));
    approveAccrualMock.mockRejectedValue(new Error("Commission accrual not found"));

    const res = await POST(
      buildRequest(`/api/v1/commissions/${ACCRUAL_ID}/approve`, {
        method: "POST",
        token: signToken(ADMIN_ID),
      }),
      withParams(ACCRUAL_ID),
    );

    expect(res.status).toBe(404);
  });
});
