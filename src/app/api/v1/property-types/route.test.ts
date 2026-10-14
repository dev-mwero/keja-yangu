/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/PropertyType", () => ({ PropertyTypeModel: getModelStubs().propertytype }));

import { GET, POST } from "@/app/api/v1/property-types/route";
import { invalidatePropertyTypeCache } from "@/lib/property-type-store";

const { user, propertytype } = getModelStubs();

const ADMIN_ID = makeObjectId("admin");
const OWNER_ID = makeObjectId("owner");

const seedDocs = [
  { _id: "1", key: "apartment", label: "Apartment", order: 0, active: true },
  { _id: "2", key: "villa", label: "Villa", order: 1, active: true },
  { _id: "3", key: "houseboat", label: "Houseboat", order: 2, active: false },
];

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/property-types", () => {
  beforeEach(() => {
    resetModelStubs();
    invalidatePropertyTypeCache();
    propertytype.exists.mockResolvedValue(true);
  });

  it("returns only active types to anonymous callers", async () => {
    propertytype.find.mockReturnValue(buildQuery(seedDocs));

    const res = await GET(buildRequest("/api/v1/property-types"));
    expect(res.status).toBe(200);
    const body = await json(res);
    const data = body.data as Array<{ key: string }>;
    expect(data.map((t) => t.key)).toEqual(["apartment", "villa"]);
  });

  it("requires authentication for the full list", async () => {
    const res = await GET(buildRequest("/api/v1/property-types?all=1"));
    expect(res.status).toBe(401);
  });

  it("rejects non-admins requesting the full list", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    const res = await GET(
      buildRequest("/api/v1/property-types?all=1", { token: signToken(OWNER_ID) }),
    );
    expect(res.status).toBe(403);
  });

  it("returns inactive types to the system admin", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "system-admin" })));
    propertytype.find.mockReturnValue(buildQuery(seedDocs));

    const res = await GET(
      buildRequest("/api/v1/property-types?all=1", { token: signToken(ADMIN_ID) }),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect((body.data as unknown[]).length).toBe(3);
  });
});

describe("POST /api/v1/property-types", () => {
  beforeEach(() => {
    resetModelStubs();
    invalidatePropertyTypeCache();
    propertytype.exists.mockResolvedValue(true);
  });

  it("requires a system admin", async () => {
    const anon = await POST(
      buildRequest("/api/v1/property-types", { method: "POST", body: { label: "Townhouse" } }),
    );
    expect(anon.status).toBe(401);

    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    const owner = await POST(
      buildRequest("/api/v1/property-types", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { label: "Townhouse" },
      }),
    );
    expect(owner.status).toBe(403);
  });

  it("rejects an empty label", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "system-admin" })));
    const res = await POST(
      buildRequest("/api/v1/property-types", {
        method: "POST",
        token: signToken(ADMIN_ID),
        body: { label: "  " },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("creates a type for the system admin", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "system-admin" })));
    propertytype.findOne.mockReturnValueOnce(buildQuery(null));
    propertytype.findOne.mockReturnValueOnce(buildQuery(null));
    propertytype.create.mockResolvedValue({
      _id: "4",
      key: "townhouse",
      label: "Townhouse",
      order: 0,
      active: true,
    });

    const res = await POST(
      buildRequest("/api/v1/property-types", {
        method: "POST",
        token: signToken(ADMIN_ID),
        body: { label: "Townhouse" },
      }),
    );
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.data).toMatchObject({ key: "townhouse", label: "Townhouse", active: true });
  });

  it("reports duplicates with 409", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "system-admin" })));
    propertytype.findOne.mockReturnValueOnce(buildQuery({ _id: "1", key: "villa" }));

    const res = await POST(
      buildRequest("/api/v1/property-types", {
        method: "POST",
        token: signToken(ADMIN_ID),
        body: { label: "Villa" },
      }),
    );
    expect(res.status).toBe(409);
  });
});
