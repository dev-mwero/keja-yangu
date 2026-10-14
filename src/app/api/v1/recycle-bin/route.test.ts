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

import { GET } from "@/app/api/v1/recycle-bin/route";

const { user, property, unit, tenant, lease, invoice, propertytype } = getModelStubs();

const ADMIN_ID = makeObjectId("admin");
const OWNER_ID = makeObjectId("owner");

function asAdmin() {
  user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "system-admin" })));
}

function stubCounts(value: number) {
  for (const stub of [property, unit, tenant, lease, invoice, propertytype]) {
    stub.countDocuments.mockReturnValue({ setOptions: () => Promise.resolve(value) });
  }
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/recycle-bin", () => {
  beforeEach(() => resetModelStubs());

  it("401 for anonymous callers", async () => {
    const res = await GET(buildRequest("/api/v1/recycle-bin"));
    expect(res.status).toBe(401);
  });

  it("403 for non-admins", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    const res = await GET(buildRequest("/api/v1/recycle-bin", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(403);
  });

  it("returns per-type counts to the system admin", async () => {
    asAdmin();
    stubCounts(4);

    const res = await GET(buildRequest("/api/v1/recycle-bin", { token: signToken(ADMIN_ID) }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data).toEqual({
      property: 4,
      unit: 4,
      tenant: 4,
      lease: 4,
      invoice: 4,
      propertytype: 4,
    });
  });

  it("returns a paginated list for a given type", async () => {
    asAdmin();
    property.find.mockReturnValue(buildQuery([{ _id: "p1", deletedAt: "2026-01-01" }]));
    property.countDocuments.mockReturnValue({ setOptions: () => Promise.resolve(1) });

    const res = await GET(
      buildRequest("/api/v1/recycle-bin?type=property&page=1&limit=10", {
        token: signToken(ADMIN_ID),
      }),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect((body.data as unknown[]).length).toBe(1);
    expect(body.pagination).toMatchObject({ page: 1, total: 1 });
  });

  it("400 for an unknown type", async () => {
    asAdmin();
    const res = await GET(
      buildRequest("/api/v1/recycle-bin?type=user", { token: signToken(ADMIN_ID) }),
    );
    expect(res.status).toBe(400);
  });
});
