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
vi.mock("@/models/Unit", () => ({ Unit: getModelStubs().unit }));
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));
vi.mock("@/models/Lease", () => ({ Lease: getModelStubs().lease }));
vi.mock("@/models/Invoice", () => ({ Invoice: getModelStubs().invoice }));
vi.mock("@/models/PropertyType", () => ({ PropertyTypeModel: getModelStubs().propertytype }));

import { DELETE } from "@/app/api/v1/recycle-bin/[type]/[id]/route";

const { user, tenant, unit } = getModelStubs();

const ADMIN_ID = makeObjectId("admin");
const OWNER_ID = makeObjectId("owner");
const RECORD_ID = makeObjectId("record");

function params(type: string, id: string) {
  return { params: Promise.resolve({ type, id }) };
}

function asAdmin() {
  user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "system-admin" })));
}

describe("DELETE /api/v1/recycle-bin/:type/:id", () => {
  beforeEach(() => resetModelStubs());

  it("401 for anonymous callers", async () => {
    const res = await DELETE(
      buildRequest(`/api/v1/recycle-bin/tenant/${RECORD_ID}`, { method: "DELETE" }),
      params("tenant", RECORD_ID),
    );
    expect(res.status).toBe(401);
  });

  it("403 for non-admins", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    const res = await DELETE(
      buildRequest(`/api/v1/recycle-bin/tenant/${RECORD_ID}`, {
        method: "DELETE",
        token: signToken(OWNER_ID),
      }),
      params("tenant", RECORD_ID),
    );
    expect(res.status).toBe(403);
  });

  it("400 for an unknown type or invalid id", async () => {
    asAdmin();
    const badType = await DELETE(
      buildRequest(`/api/v1/recycle-bin/bookmark/${RECORD_ID}`, {
        method: "DELETE",
        token: signToken(ADMIN_ID),
      }),
      params("bookmark", RECORD_ID),
    );
    expect(badType.status).toBe(400);

    const badId = await DELETE(
      buildRequest("/api/v1/recycle-bin/tenant/not-an-id", {
        method: "DELETE",
        token: signToken(ADMIN_ID),
      }),
      params("tenant", "not-an-id"),
    );
    expect(badId.status).toBe(400);
  });

  it("404 when nothing is purged", async () => {
    asAdmin();
    tenant.deleteOne.mockResolvedValue({ deletedCount: 0 });

    const res = await DELETE(
      buildRequest(`/api/v1/recycle-bin/tenant/${RECORD_ID}`, {
        method: "DELETE",
        token: signToken(ADMIN_ID),
      }),
      params("tenant", RECORD_ID),
    );
    expect(res.status).toBe(404);
  });

  it("purges the soft-deleted record", async () => {
    asAdmin();
    tenant.deleteOne.mockResolvedValue({ deletedCount: 1 });

    const res = await DELETE(
      buildRequest(`/api/v1/recycle-bin/tenant/${RECORD_ID}`, {
        method: "DELETE",
        token: signToken(ADMIN_ID),
      }),
      params("tenant", RECORD_ID),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { purged: boolean } };
    expect(body.data.purged).toBe(true);
    expect(tenant.deleteOne).toHaveBeenCalledWith({
      _id: RECORD_ID,
      deletedAt: { $ne: null },
    });
    expect(unit.deleteMany).not.toHaveBeenCalled();
  });
});
