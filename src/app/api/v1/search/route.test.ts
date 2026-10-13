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
vi.mock("@/models/Invoice", () => ({ Invoice: getModelStubs().invoice }));

import { GET } from "@/app/api/v1/search/route";

const { user, property, unit, tenant, invoice } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const TENANT_ID = makeObjectId("tenant");
const TENANT_DOC_ID = makeObjectId("tenantdoc");

async function json(res: Response) {
  return (await res.json()) as { data: Array<Record<string, unknown>> };
}

describe("GET /api/v1/search", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/search", { query: { q: "sunset" } }));
    expect(res.status).toBe(401);
  });

  it("returns an empty list for a query shorter than 2 chars", async () => {
    const res = await GET(
      buildRequest("/api/v1/search", { token: signToken(OWNER_ID), query: { q: "a" } }),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data).toEqual([]);
    expect(user.findById).not.toHaveBeenCalled();
  });

  it("scopes tenant results to their own unit and invoices", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_ID, role: "tenant" })));
    tenant.findOne.mockReturnValue(buildQuery({ _id: TENANT_DOC_ID }));
    unit.find.mockReturnValue(
      buildQuery([
        {
          _id: makeObjectId("unit"),
          name: "3A",
          blockName: "D",
        },
      ]),
    );
    invoice.find.mockReturnValue(buildQuery([]));

    const res = await GET(
      buildRequest("/api/v1/search", { token: signToken(TENANT_ID), query: { q: "3a" } }),
    );
    expect(res.status).toBe(200);
    expect(tenant.findOne).toHaveBeenCalledWith({ userId: TENANT_ID });
    expect(unit.find).toHaveBeenCalledWith({ tenantId: TENANT_ID });
    const body = await json(res);
    expect(body.data[0]).toMatchObject({ type: "unit", title: "Unit 3A" });
  });

  it("scopes owner results to their portfolio", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    property.find.mockReturnValue(
      buildQuery([{ _id: makeObjectId("prop"), title: "Sunset Villa", location: "Kilimani" }]),
    );
    unit.find.mockReturnValue(buildQuery([]));
    tenant.find.mockReturnValue(buildQuery([]));
    invoice.find.mockReturnValue(buildQuery([]));

    const res = await GET(
      buildRequest("/api/v1/search", { token: signToken(OWNER_ID), query: { q: "sun" } }),
    );
    expect(res.status).toBe(200);
    expect(property.find).toHaveBeenCalledWith(expect.objectContaining({ ownerId: OWNER_ID }));
    const body = await json(res);
    expect(body.data[0]).toMatchObject({ type: "property", title: "Sunset Villa" });
  });

  it("403 for an orphaned custodian", async () => {
    user.findById.mockReturnValue(
      buildQuery(
        makeUser({ _id: makeObjectId("custodian"), role: "custodian", managedByOwnerId: "" }),
      ),
    );
    const res = await GET(
      buildRequest("/api/v1/search", {
        token: signToken(makeObjectId("custodian")),
        query: { q: "sun" },
      }),
    );
    expect(res.status).toBe(403);
  });
});
