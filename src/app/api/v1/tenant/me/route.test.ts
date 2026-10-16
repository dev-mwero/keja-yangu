/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Tenant", () => ({
  Tenant: getModelStubs().tenant,
  TENANT_SAFE_FIELDS:
    "name email phone propertyId ownerId status joinedAt notes createdAt updatedAt",
}));

import { GET } from "@/app/api/v1/tenant/me/route";

const { user, tenant } = getModelStubs();

const TENANT_ID = makeObjectId("tenant");
const TENANT_DOC_ID = makeObjectId("tenantdoc");
const PROP_ID = makeObjectId("prop");

function tenancyDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: TENANT_DOC_ID,
    name: "Amina",
    email: "amina@keja.co",
    propertyId: PROP_ID,
    ownerId: makeObjectId("owner"),
    status: "active",
    ...overrides,
  };
}

function tenantUser() {
  user.findById.mockReturnValue(
    buildQuery(makeUser({ _id: TENANT_ID, role: "tenant", email: "amina@keja.co" })),
  );
}

describe("GET /api/v1/tenant/me", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/tenant/me"));
    expect(res.status).toBe(401);
  });

  it("403 for a non-tenant role", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ role: "owner" })));
    const res = await GET(buildRequest("/api/v1/tenant/me", { token: signToken(TENANT_ID) }));
    expect(res.status).toBe(403);
  });

  it("returns the tenancy bound to the userId", async () => {
    tenantUser();
    tenant.findOne.mockReturnValue(buildQuery(tenancyDoc()));

    const res = await GET(buildRequest("/api/v1/tenant/me", { token: signToken(TENANT_ID) }));
    expect(res.status).toBe(200);
    expect(tenant.findOne).toHaveBeenCalledWith({ userId: TENANT_ID, deletedAt: null });
    const json = await res.json();
    expect(json.data).toMatchObject({ _id: TENANT_DOC_ID, propertyId: PROP_ID });
  });

  it("falls back to an email match and heals the link", async () => {
    tenantUser();
    tenant.findOne
      .mockReturnValueOnce(buildQuery(null))
      .mockReturnValueOnce(buildQuery(tenancyDoc()));

    const res = await GET(buildRequest("/api/v1/tenant/me", { token: signToken(TENANT_ID) }));
    expect(res.status).toBe(200);
    expect(tenant.findOne).toHaveBeenNthCalledWith(2, {
      email: "amina@keja.co",
      deletedAt: null,
    });
    expect(tenant.updateOne).toHaveBeenCalledWith(
      { _id: TENANT_DOC_ID },
      { $set: { userId: TENANT_ID } },
    );
  });

  it("404 when the tenant has no tenancy", async () => {
    tenantUser();
    tenant.findOne.mockReturnValue(buildQuery(null));

    const res = await GET(buildRequest("/api/v1/tenant/me", { token: signToken(TENANT_ID) }));
    expect(res.status).toBe(404);
  });
});
