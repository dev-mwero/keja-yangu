/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));

import { GET } from "@/app/api/v1/admin/users/route";

const models = getModelStubs();
const SYS_ADMIN_ID = makeObjectId("sysadmin");
const OWNER_ID = makeObjectId("owner");

function sysAdminDoc() {
  return makeUser({ _id: SYS_ADMIN_ID, role: "system-admin" });
}

describe("GET /api/v1/admin/users", () => {
  beforeEach(() => {
    resetModelStubs();
    process.env.ROLE_MANAGEMENT_ENABLED = "true";
    models.user.findById.mockReturnValue(buildQuery(sysAdminDoc()));
  });

  afterEach(() => {
    delete process.env.ROLE_MANAGEMENT_ENABLED;
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/admin/users"));
    expect(res.status).toBe(401);
  });

  it("404 when the feature flag is disabled", async () => {
    process.env.ROLE_MANAGEMENT_ENABLED = "false";
    const res = await GET(buildRequest("/api/v1/admin/users", { token: signToken(SYS_ADMIN_ID) }));
    expect(res.status).toBe(404);
  });

  it("403 for a non-system-admin actor", async () => {
    models.user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    const res = await GET(buildRequest("/api/v1/admin/users", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(403);
  });

  it("401 when the token is stale (tokenVersion mismatch)", async () => {
    const res = await GET(
      buildRequest("/api/v1/admin/users", {
        token: signToken(SYS_ADMIN_ID, { tokenVersion: 99 }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("lists users with pagination", async () => {
    const users = [
      makeUser({ _id: makeObjectId("u1"), name: "User One", role: "tenant" }),
      makeUser({ _id: makeObjectId("u2"), name: "User Two", role: "owner" }),
    ];
    models.user.find.mockReturnValue(buildQuery(users));
    models.user.countDocuments.mockResolvedValue(2);

    const res = await GET(buildRequest("/api/v1/admin/users", { token: signToken(SYS_ADMIN_ID) }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<Record<string, unknown>>;
      pagination: { total: number; page: number; limit: number };
    };
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toMatchObject({ name: "User One", role: "tenant" });
    expect(body.pagination.total).toBe(2);
  });

  it("applies role and search filters", async () => {
    models.user.find.mockReturnValue(buildQuery([]));
    models.user.countDocuments.mockResolvedValue(0);

    const res = await GET(
      buildRequest("/api/v1/admin/users", {
        token: signToken(SYS_ADMIN_ID),
        query: { role: "caretaker", search: "ann", page: "2", limit: "5" },
      }),
    );
    expect(res.status).toBe(200);
    const filter = models.user.find.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(filter.role).toBe("caretaker");
    expect(filter.$or).toBeDefined();
  });
});
