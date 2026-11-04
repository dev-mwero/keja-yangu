/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

const { resolveAttributionDisputeMock } = vi.hoisted(() => ({
  resolveAttributionDisputeMock: vi.fn(),
}));

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/attributions", () => ({
  resolveAttributionDispute: resolveAttributionDisputeMock,
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));

import { POST } from "@/app/api/v1/admin/attributions/[id]/dispute/route";

const { user } = getModelStubs();
const SYS_ADMIN_ID = makeObjectId("sysadmin");
const ADMIN_ID = makeObjectId("admin");
const ATTR_ID = makeObjectId("attribution");

describe("POST /api/v1/admin/attributions/[id]/dispute", () => {
  beforeEach(() => {
    resetModelStubs();
    resolveAttributionDisputeMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await POST(
      buildRequest(`/api/v1/admin/attributions/${ATTR_ID}/dispute`, {
        method: "POST",
        body: { reason: "Appeal" },
      }),
      withParams(ATTR_ID),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid attribution id", async () => {
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: SYS_ADMIN_ID, role: "system-admin" })),
    );
    const res = await POST(
      buildRequest("/api/v1/admin/attributions/not-an-id/dispute", {
        method: "POST",
        token: signToken(SYS_ADMIN_ID),
        body: { reason: "Appeal" },
      }),
      withParams("not-an-id"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when a non-system-admin tries to resolve", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "admin" })));
    const res = await POST(
      buildRequest(`/api/v1/admin/attributions/${ATTR_ID}/dispute`, {
        method: "POST",
        token: signToken(ADMIN_ID),
        body: { reason: "Appeal" },
      }),
      withParams(ATTR_ID),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when the reason is missing", async () => {
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: SYS_ADMIN_ID, role: "system-admin" })),
    );
    const res = await POST(
      buildRequest(`/api/v1/admin/attributions/${ATTR_ID}/dispute`, {
        method: "POST",
        token: signToken(SYS_ADMIN_ID),
        body: {},
      }),
      withParams(ATTR_ID),
    );
    expect(res.status).toBe(400);
  });

  it("resolves the dispute and returns both records", async () => {
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: SYS_ADMIN_ID, role: "system-admin" })),
    );
    resolveAttributionDisputeMock.mockResolvedValue({
      original: { _id: ATTR_ID, status: "disputed" },
      superseding: { _id: "attr-new", status: "confirmed" },
    });

    const res = await POST(
      buildRequest(`/api/v1/admin/attributions/${ATTR_ID}/dispute`, {
        method: "POST",
        token: signToken(SYS_ADMIN_ID),
        body: { reason: "Prior broker verified", newBrokerUserId: "broker-new" },
      }),
      withParams(ATTR_ID),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.original.status).toBe("disputed");
    expect(json.data.superseding.status).toBe("confirmed");
    expect(resolveAttributionDisputeMock).toHaveBeenCalledWith(
      { userId: SYS_ADMIN_ID, role: "system-admin" },
      ATTR_ID,
      expect.objectContaining({ reason: "Prior broker verified", newBrokerUserId: "broker-new" }),
    );
  });
});
