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

import { POST } from "@/app/api/v1/recycle-bin/[type]/[id]/restore/route";

const { user, property, unit } = getModelStubs();

const ADMIN_ID = makeObjectId("admin");
const OWNER_ID = makeObjectId("owner");
const RECORD_ID = makeObjectId("record");

function params(type: string, id: string) {
  return { params: Promise.resolve({ type, id }) };
}

function asAdmin() {
  user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "system-admin" })));
}

describe("POST /api/v1/recycle-bin/:type/:id/restore", () => {
  beforeEach(() => resetModelStubs());

  it("401 for anonymous callers", async () => {
    const res = await POST(
      buildRequest(`/api/v1/recycle-bin/tenant/${RECORD_ID}/restore`, { method: "POST" }),
      params("tenant", RECORD_ID),
    );
    expect(res.status).toBe(401);
  });

  it("403 for non-admins", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    const res = await POST(
      buildRequest(`/api/v1/recycle-bin/tenant/${RECORD_ID}/restore`, {
        method: "POST",
        token: signToken(OWNER_ID),
      }),
      params("tenant", RECORD_ID),
    );
    expect(res.status).toBe(403);
  });

  it("400 for an unknown type or invalid id", async () => {
    asAdmin();
    const badType = await POST(
      buildRequest(`/api/v1/recycle-bin/user/${RECORD_ID}/restore`, {
        method: "POST",
        token: signToken(ADMIN_ID),
      }),
      params("user", RECORD_ID),
    );
    expect(badType.status).toBe(400);

    const badId = await POST(
      buildRequest("/api/v1/recycle-bin/tenant/not-an-id/restore", {
        method: "POST",
        token: signToken(ADMIN_ID),
      }),
      params("tenant", "not-an-id"),
    );
    expect(badId.status).toBe(400);
  });

  it("404 when no deleted record matches", async () => {
    asAdmin();
    property.restoreById.mockResolvedValue({ matchedCount: 0 });

    const res = await POST(
      buildRequest(`/api/v1/recycle-bin/property/${RECORD_ID}/restore`, {
        method: "POST",
        token: signToken(ADMIN_ID),
      }),
      params("property", RECORD_ID),
    );
    expect(res.status).toBe(404);
    expect(unit.updateMany).not.toHaveBeenCalled();
  });

  it("restores the record and returns it", async () => {
    asAdmin();
    property.restoreById.mockResolvedValue({ matchedCount: 1 });
    unit.updateMany.mockResolvedValue({});

    const res = await POST(
      buildRequest(`/api/v1/recycle-bin/property/${RECORD_ID}/restore`, {
        method: "POST",
        token: signToken(ADMIN_ID),
      }),
      params("property", RECORD_ID),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { type: string; _id: string } };
    expect(body.data).toEqual({ type: "property", _id: RECORD_ID });
    expect(property.restoreById).toHaveBeenCalledWith(RECORD_ID);
  });
});
