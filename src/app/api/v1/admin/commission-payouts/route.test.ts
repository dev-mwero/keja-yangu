/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

const { createPayoutBatchMock } = vi.hoisted(() => ({ createPayoutBatchMock: vi.fn() }));

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/commission", () => ({ createPayoutBatch: createPayoutBatchMock }));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/CommissionPayout", () => ({
  CommissionPayout: getModelStubs().commissionPayout,
}));

import { GET, POST } from "@/app/api/v1/admin/commission-payouts/route";

const { user, commissionPayout } = getModelStubs();
const SYS_ADMIN_ID = makeObjectId("sysadmin");
const ADMIN_ID = makeObjectId("admin");
const BROKER_ID = makeObjectId("broker");

describe("/api/v1/admin/commission-payouts", () => {
  beforeEach(() => {
    resetModelStubs();
    createPayoutBatchMock.mockReset();
  });

  it("returns 403 for a regular admin", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "admin" })));
    const res = await GET(
      buildRequest("/api/v1/admin/commission-payouts", { token: signToken(ADMIN_ID) }),
    );
    expect(res.status).toBe(403);
  });

  it("lists payout batches for a system admin", async () => {
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: SYS_ADMIN_ID, role: "system-admin" })),
    );
    commissionPayout.find.mockReturnValue(
      buildQuery([{ _id: "payout-1", brokerUserId: BROKER_ID, status: "approved" }]),
    );
    commissionPayout.countDocuments.mockResolvedValue(1);

    const res = await GET(
      buildRequest("/api/v1/admin/commission-payouts", { token: signToken(SYS_ADMIN_ID) }),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).pagination.total).toBe(1);
  });

  it("creates a payout batch", async () => {
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: SYS_ADMIN_ID, role: "system-admin" })),
    );
    createPayoutBatchMock.mockResolvedValue({ _id: "payout-1", status: "approved" });

    const res = await POST(
      buildRequest("/api/v1/admin/commission-payouts", {
        method: "POST",
        token: signToken(SYS_ADMIN_ID),
        body: { brokerUserId: BROKER_ID },
      }),
    );

    expect(res.status).toBe(201);
    expect(createPayoutBatchMock).toHaveBeenCalledWith(
      { userId: SYS_ADMIN_ID, role: "system-admin" },
      BROKER_ID,
      undefined,
    );
  });
});
