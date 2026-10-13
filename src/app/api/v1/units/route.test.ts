/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeUnit, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Unit", () => ({ Unit: getModelStubs().unit }));

import { GET } from "@/app/api/v1/units/route";

const { user, property, unit } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const CUSTODIAN_ID = makeObjectId("custodian");
const CARETAKER_ID = makeObjectId("caretaker");
const TENANT_ID = makeObjectId("tenant");

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

function listResult(docs: unknown[]) {
  unit.find.mockReturnValue(buildQuery(docs));
  unit.countDocuments.mockResolvedValue(docs.length);
}

describe("GET /api/v1/units", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/units"));
    expect(res.status).toBe(401);
  });

  it("scopes an owner to their own units", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    listResult([makeUnit({ ownerId: OWNER_ID })]);

    const res = await GET(buildRequest("/api/v1/units", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(200);
    expect(unit.find).toHaveBeenCalledWith({ ownerId: OWNER_ID });
    const body = await json(res);
    expect(body.data).toHaveLength(1);
  });

  it("scopes a custodian to the managing owner's units", async () => {
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: CUSTODIAN_ID, role: "custodian", managedByOwnerId: OWNER_ID })),
    );
    listResult([]);

    const res = await GET(buildRequest("/api/v1/units", { token: signToken(CUSTODIAN_ID) }));
    expect(res.status).toBe(200);
    expect(unit.find).toHaveBeenCalledWith({ ownerId: OWNER_ID });
  });

  it("403 for an orphaned custodian", async () => {
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: CUSTODIAN_ID, role: "custodian", managedByOwnerId: "" })),
    );
    const res = await GET(buildRequest("/api/v1/units", { token: signToken(CUSTODIAN_ID) }));
    expect(res.status).toBe(403);
  });

  it("scopes a caretaker to assigned properties of the managing owner", async () => {
    const p1 = makeObjectId("p1");
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: CARETAKER_ID, role: "caretaker", managedByOwnerId: OWNER_ID })),
    );
    property.find.mockReturnValue(buildQuery([{ _id: p1 }]));
    listResult([]);

    const res = await GET(buildRequest("/api/v1/units", { token: signToken(CARETAKER_ID) }));
    expect(res.status).toBe(200);
    expect(unit.find).toHaveBeenCalledWith({ ownerId: OWNER_ID, propertyId: { $in: [p1] } });
  });

  it("scopes a tenant to units they occupy", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_ID, role: "tenant" })));
    listResult([]);

    const res = await GET(buildRequest("/api/v1/units", { token: signToken(TENANT_ID) }));
    expect(res.status).toBe(200);
    expect(unit.find).toHaveBeenCalledWith({ tenantId: TENANT_ID });
  });
});
