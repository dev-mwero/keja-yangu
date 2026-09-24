/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
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

import { GET } from "@/app/api/v1/notifications/route";

const { user, notification } = getModelStubs();

const USER_ID = makeObjectId("user");
const NOTIF_ID = makeObjectId("notification");

function ownerDoc() {
  return makeUser({ _id: USER_ID, role: "owner" });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/notifications", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/notifications"));
    expect(res.status).toBe(401);
  });

  it("scopes to the authenticated user and paginates with a default limit of 20", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    const row = makeNotification({
      _id: NOTIF_ID,
      recipientUserId: USER_ID,
      type: "invoice:paid",
      readAt: new Date("2026-09-02T08:00:00.000Z"),
    });
    notification.find.mockReturnValue(buildQuery([row]).sort({ createdAt: -1 }).skip(0).limit(20));
    notification.countDocuments.mockResolvedValue(1);

    const res = await GET(buildRequest("/api/v1/notifications", { token: signToken(USER_ID) }));
    expect(res.status).toBe(200);
    expect(notification.find).toHaveBeenCalledWith({ recipientUserId: USER_ID });
    const body = await json(res);
    const data = body.data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(1);
    expect(data[0].readAt).toBe("2026-09-02T08:00:00.000Z");
    expect(data[0].channels).toEqual(["in-app"]);
    expect(data[0].link).toBe("");
    expect((body.pagination as { limit: number }).limit).toBe(20);
  });

  it("filters unread=true to readAt:null rows", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    notification.find.mockReturnValue(buildQuery([]).sort({ createdAt: -1 }).skip(0).limit(20));
    notification.countDocuments.mockResolvedValue(0);

    const res = await GET(
      buildRequest("/api/v1/notifications?unread=true", { token: signToken(USER_ID) }),
    );
    expect(res.status).toBe(200);
    expect(notification.find).toHaveBeenCalledWith({ recipientUserId: USER_ID, readAt: null });
  });

  it("filters by type when present", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    notification.find.mockReturnValue(buildQuery([]).sort({ createdAt: -1 }).skip(0).limit(20));
    notification.countDocuments.mockResolvedValue(0);

    const res = await GET(
      buildRequest("/api/v1/notifications?type=lease:expiring", { token: signToken(USER_ID) }),
    );
    expect(res.status).toBe(200);
    expect(notification.find).toHaveBeenCalledWith({
      recipientUserId: USER_ID,
      type: "lease:expiring",
    });
  });

  it("400 for an invalid type filter before any query runs", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    notification.find.mockReturnValue(buildQuery([]).sort({ createdAt: -1 }).skip(0).limit(20));
    notification.countDocuments.mockResolvedValue(0);

    const res = await GET(
      buildRequest("/api/v1/notifications?type=bogus", { token: signToken(USER_ID) }),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid query");
    expect(notification.find).not.toHaveBeenCalled();
    expect(notification.countDocuments).not.toHaveBeenCalled();
  });

  it("honours an explicit limit and page", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    notification.find.mockReturnValue(buildQuery([]).sort({ createdAt: -1 }).skip(5).limit(5));
    notification.countDocuments.mockResolvedValue(0);

    const res = await GET(
      buildRequest("/api/v1/notifications?page=2&limit=5", { token: signToken(USER_ID) }),
    );
    expect(res.status).toBe(200);
    expect(notification.find).toHaveBeenCalledWith({ recipientUserId: USER_ID });
  });
});
