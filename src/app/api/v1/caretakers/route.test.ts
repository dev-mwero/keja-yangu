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

import { GET } from "@/app/api/v1/caretakers/route";

const { user, property } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const OTHER_OWNER_ID = makeObjectId("other-owner");
const CARE_1 = makeObjectId("care-1");
const CARE_2 = makeObjectId("care-2");

function ownerDoc() {
  return makeUser({ _id: OWNER_ID, role: "owner" });
}

function adminDoc() {
  return makeUser({ _id: makeObjectId("admin"), role: "system-admin" });
}

function caretakerRow(overrides: Partial<ReturnType<typeof makeUser>> = {}) {
  return makeUser({
    _id: CARE_1,
    role: "caretaker",
    managedByOwnerId: OWNER_ID,
    privileges: ["manage_tenants"],
    ...overrides,
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/caretakers", () => {
  beforeEach(() => {
    resetModelStubs();
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/caretakers"));
    expect(res.status).toBe(401);
  });

  it("401 for an inactive user", async () => {
    user.findById.mockReturnValue(buildQuery({ ...ownerDoc(), isActive: false }));
    const res = await GET(buildRequest("/api/v1/caretakers", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(401);
  });

  it("403 for a caretaker", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerRow({ _id: makeObjectId("self") })));
    const res = await GET(buildRequest("/api/v1/caretakers", { token: signToken(CARE_1) }));
    expect(res.status).toBe(403);
  });

  it("403 for a tenant", async () => {
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: makeObjectId("tenant"), role: "tenant" })),
    );
    const res = await GET(
      buildRequest("/api/v1/caretakers", { token: signToken(makeObjectId("tenant")) }),
    );
    expect(res.status).toBe(403);
  });

  it("owner sees only caretakers they manage", async () => {
    const rows = [caretakerRow(), caretakerRow({ _id: CARE_2, name: "Zena W" })];
    const chain = buildQuery(rows);
    user.find.mockReturnValue(chain);
    property.aggregate.mockResolvedValue([{ _id: CARE_1, count: 3 }]);

    const res = await GET(buildRequest("/api/v1/caretakers", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(200);
    expect(user.find).toHaveBeenCalledWith({ role: "caretaker", managedByOwnerId: OWNER_ID });
    expect(chain.select).toHaveBeenCalledWith("name email managedByOwnerId privileges");
    expect(property.aggregate).toHaveBeenCalled();
    const data = (await json(res)).data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      id: CARE_1,
      name: "Test Owner",
      managedByOwnerId: OWNER_ID,
      privileges: ["manage_tenants"],
      propertyCount: 3,
    });
    expect(data[1]).toMatchObject({ id: CARE_2, propertyCount: 0 });
  });

  it("owner may pass their own ownerId filter", async () => {
    user.find.mockReturnValue(buildQuery([]));
    property.aggregate.mockResolvedValue([]);
    const res = await GET(
      buildRequest(`/api/v1/caretakers?ownerId=${OWNER_ID}`, { token: signToken(OWNER_ID) }),
    );
    expect(res.status).toBe(200);
    expect(user.find).toHaveBeenCalledWith({ role: "caretaker", managedByOwnerId: OWNER_ID });
  });

  it("403 when an owner asks for a foreign ownerId filter", async () => {
    const res = await GET(
      buildRequest(`/api/v1/caretakers?ownerId=${OTHER_OWNER_ID}`, { token: signToken(OWNER_ID) }),
    );
    expect(res.status).toBe(403);
  });

  it("system-admin sees all caretakers and can filter by any ownerId", async () => {
    user.findById.mockReturnValue(buildQuery(adminDoc()));
    const rows = [caretakerRow()];
    user.find.mockReturnValue(buildQuery(rows));
    property.aggregate.mockResolvedValue([{ _id: CARE_1, count: 1 }]);

    const res = await GET(
      buildRequest(`/api/v1/caretakers?ownerId=${OWNER_ID}`, { token: signToken(adminDoc()._id) }),
    );
    expect(res.status).toBe(200);
    expect(user.find).toHaveBeenCalledWith({ role: "caretaker", managedByOwnerId: OWNER_ID });
  });

  it("skips the propertyCount aggregate when there are no caretakers", async () => {
    user.find.mockReturnValue(buildQuery([]));
    const res = await GET(buildRequest("/api/v1/caretakers", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual([]);
    expect(property.aggregate).not.toHaveBeenCalled();
  });
});
