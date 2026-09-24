/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Notification", () => ({ Notification: getModelStubs().notification }));

import { POST } from "@/app/api/v1/notifications/mark-all-read/route";

const { user, notification } = getModelStubs();

const USER_ID = makeObjectId("user");

describe("POST /api/v1/notifications/mark-all-read", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("403 for a mismatched origin", async () => {
    const res = await POST(
      buildRequest("/api/v1/notifications/mark-all-read", {
        method: "POST",
        token: signToken(USER_ID),
        headers: { origin: "http://evil.example" },
        body: {},
      }),
    );
    expect(res.status).toBe(403);
  });

  it("401 when unauthenticated", async () => {
    const res = await POST(
      buildRequest("/api/v1/notifications/mark-all-read", { method: "POST", body: {} }),
    );
    expect(res.status).toBe(401);
  });

  it("marks every unread row of the authenticated user read", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: USER_ID, role: "tenant" })));
    notification.updateMany.mockResolvedValue({ modifiedCount: 2 });

    const res = await POST(
      buildRequest("/api/v1/notifications/mark-all-read", {
        method: "POST",
        token: signToken(USER_ID),
        body: {},
      }),
    );
    expect(res.status).toBe(200);
    expect(notification.updateMany).toHaveBeenCalledWith(
      { recipientUserId: USER_ID, readAt: null },
      { $set: { readAt: expect.any(Date) } },
    );
    const body = (await res.json()) as { data: { modifiedCount: number } };
    expect(body.data.modifiedCount).toBe(2);
  });
});
