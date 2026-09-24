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

import { GET } from "@/app/api/v1/notifications/unread-count/route";

const { user, notification } = getModelStubs();

const USER_ID = makeObjectId("user");

describe("GET /api/v1/notifications/unread-count", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/notifications/unread-count"));
    expect(res.status).toBe(401);
  });

  it("returns the unread count for the authenticated user", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: USER_ID, role: "tenant" })));
    notification.countDocuments.mockResolvedValue(3);

    const res = await GET(
      buildRequest("/api/v1/notifications/unread-count", { token: signToken(USER_ID) }),
    );
    expect(res.status).toBe(200);
    expect(notification.countDocuments).toHaveBeenCalledWith({
      recipientUserId: USER_ID,
      readAt: null,
    });
    const body = (await res.json()) as { data: { count: number } };
    expect(body.data.count).toBe(3);
  });
});
