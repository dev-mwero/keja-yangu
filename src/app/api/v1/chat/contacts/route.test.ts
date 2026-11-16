/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));
vi.mock("@/models/ManagementAssignment", () => ({
  ManagementAssignment: getModelStubs().managementAssignment,
}));

import { GET } from "@/app/api/v1/chat/contacts/route";

const { user, tenant, managementAssignment } = getModelStubs();

const USER_ID = makeObjectId("user");
const OWNER_ID = makeObjectId("admin");

function tenantUser() {
  return makeUser({ _id: USER_ID, role: "tenant" });
}

it("401 when unauthenticated", async () => {
  const res = await GET(buildRequest("/api/v1/chat/contacts"));
  expect(res.status).toBe(401);
});

it("403 for a non-tenant", async () => {
  user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "admin" })));
  managementAssignment.find.mockReturnValue(buildQuery([]));

  const res = await GET(buildRequest("/api/v1/chat/contacts", { token: signToken(OWNER_ID) }));
  expect(res.status).toBe(403);
});

describe("GET /api/v1/chat/contacts", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("returns an empty list when the tenant has no tenancy", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(buildQuery([]));

    const res = await GET(buildRequest("/api/v1/chat/contacts", { token: signToken(USER_ID) }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toEqual([]);
  });
});
