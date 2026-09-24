/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeNotification, makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Notification", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/models/Notification")>();
  return { ...actual, Notification: getModelStubs().notification };
});

import { PATCH } from "@/app/api/v1/notifications/[id]/route";

const { user, notification } = getModelStubs();

const USER_ID = makeObjectId("user");
const NOTIF_ID = makeObjectId("notification");
const INVALID_ID = "not-an-objectid";

function ownerDoc() {
  return makeUser({ _id: USER_ID, role: "owner" });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("PATCH /api/v1/notifications/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("403 for a mismatched origin", async () => {
    const res = await PATCH(
      buildRequest(`/api/v1/notifications/${NOTIF_ID}`, {
        method: "PATCH",
        token: signToken(USER_ID),
        headers: { origin: "http://evil.example" },
        body: {},
      }),
      withParams(NOTIF_ID),
    );
    expect(res.status).toBe(403);
  });

  it("400 for an invalid notification id", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    const res = await PATCH(
      buildRequest(`/api/v1/notifications/${INVALID_ID}`, {
        method: "PATCH",
        token: signToken(USER_ID),
        body: {},
      }),
      withParams(INVALID_ID),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid notification id");
  });

  it("401 when unauthenticated", async () => {
    const res = await PATCH(
      buildRequest(`/api/v1/notifications/${NOTIF_ID}`, { method: "PATCH", body: {} }),
      withParams(NOTIF_ID),
    );
    expect(res.status).toBe(401);
  });

  it("404 when the row does not belong to the authenticated user", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    notification.findOneAndUpdate.mockReturnValue(buildQuery(null));
    const res = await PATCH(
      buildRequest(`/api/v1/notifications/${NOTIF_ID}`, {
        method: "PATCH",
        token: signToken(USER_ID),
        body: {},
      }),
      withParams(NOTIF_ID),
    );
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.error).toBe("Notification not found");
    expect(notification.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: NOTIF_ID, recipientUserId: USER_ID },
      { $set: { readAt: expect.any(Date) } },
      { new: true },
    );
  });

  it("marks the row read and returns the serialized row", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    notification.findOneAndUpdate.mockReturnValue(
      buildQuery(
        makeNotification({
          _id: NOTIF_ID,
          recipientUserId: USER_ID,
          readAt: new Date("2026-09-03T08:00:00.000Z"),
        }),
      ),
    );
    const res = await PATCH(
      buildRequest(`/api/v1/notifications/${NOTIF_ID}`, {
        method: "PATCH",
        token: signToken(USER_ID),
        body: {},
      }),
      withParams(NOTIF_ID),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect((body.data as { readAt?: string }).readAt).toBe("2026-09-03T08:00:00.000Z");
  });

  it("429 after the per-IP rate limit is exhausted", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    notification.findOneAndUpdate.mockReturnValue(buildQuery(null));
    let lastStatus = 0;
    for (let i = 0; i < 21; i += 1) {
      const res = await PATCH(
        buildRequest(`/api/v1/notifications/${NOTIF_ID}`, {
          method: "PATCH",
          token: signToken(USER_ID),
          headers: { "x-forwarded-for": "203.0.113.20" },
          body: {},
        }),
        withParams(NOTIF_ID),
      );
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
