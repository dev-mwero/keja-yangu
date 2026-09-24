/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));

import { GET, PATCH } from "@/app/api/v1/settings/route";

const { user } = getModelStubs();

const USER_ID = makeObjectId("user");

function tenantDoc() {
  return makeUser({ _id: USER_ID, role: "tenant" });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/settings", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/settings"));
    expect(res.status).toBe(401);
  });

  it("returns defaults merged with the stored settings", async () => {
    user.findById.mockReturnValue(
      buildQuery({
        ...tenantDoc(),
        settings: { emailNotifications: false, language: "sw" },
      }),
    );
    const res = await GET(buildRequest("/api/v1/settings", { token: signToken(USER_ID) }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data).toEqual({
      emailNotifications: false,
      smsNotifications: true,
      marketingEmails: false,
      moderationReminders: true,
      language: "sw",
      theme: "system",
    });
  });

  it("falls back to defaults for a legacy user without settings", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    const res = await GET(buildRequest("/api/v1/settings", { token: signToken(USER_ID) }));
    const body = await json(res);
    expect(body.data).toEqual({
      emailNotifications: true,
      smsNotifications: true,
      marketingEmails: false,
      moderationReminders: true,
      language: "en",
      theme: "system",
    });
  });
});

describe("PATCH /api/v1/settings", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("403 for a mismatched origin", async () => {
    const res = await PATCH(
      buildRequest("/api/v1/settings", {
        method: "PATCH",
        token: signToken(USER_ID),
        headers: { origin: "http://evil.example" },
        body: {},
      }),
    );
    expect(res.status).toBe(403);
  });

  it("401 when unauthenticated", async () => {
    const res = await PATCH(buildRequest("/api/v1/settings", { method: "PATCH", body: {} }));
    expect(res.status).toBe(401);
  });

  it("400 for an invalid settings payload", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    const res = await PATCH(
      buildRequest("/api/v1/settings", {
        method: "PATCH",
        token: signToken(USER_ID),
        body: { language: "kl" },
      }),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid settings payload");
  });

  it("applies dotted-path $set and returns the merged result", async () => {
    user.findById.mockReturnValueOnce(buildQuery(tenantDoc())).mockReturnValueOnce(
      buildQuery({
        ...tenantDoc(),
        settings: { emailNotifications: false, language: "sw" },
      }),
    );
    user.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const res = await PATCH(
      buildRequest("/api/v1/settings", {
        method: "PATCH",
        token: signToken(USER_ID),
        body: { emailNotifications: false, language: "sw" },
      }),
    );
    expect(res.status).toBe(200);
    expect(user.updateOne).toHaveBeenCalledWith(
      { _id: USER_ID },
      {
        $set: {
          "settings.emailNotifications": false,
          "settings.language": "sw",
        },
      },
    );
    const body = await json(res);
    expect((body.data as { language?: string }).language).toBe("sw");
    expect((body.data as { emailNotifications?: boolean }).emailNotifications).toBe(false);
  });

  it("silently strips unknown keys", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    user.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const res = await PATCH(
      buildRequest("/api/v1/settings", {
        method: "PATCH",
        token: signToken(USER_ID),
        body: { theme: "light", ownerId: "hax" },
      }),
    );
    expect(res.status).toBe(200);
    expect(user.updateOne).toHaveBeenCalledWith(
      { _id: USER_ID },
      { $set: { "settings.theme": "light" } },
    );
  });
});
