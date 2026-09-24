/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeInvoice, makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));
vi.mock("@/models/Invoice", () => ({ Invoice: getModelStubs().invoice }));

import { GET } from "@/app/api/v1/tenant/me/invoices/route";

const { user, tenant: tenantStub, invoice: invoiceStub } = getModelStubs();

const TENANT_USER_ID = makeObjectId("tenant-user");
const OWNER_ID = makeObjectId("owner");
const TENANT_A = makeObjectId("tenant-a");
const TENANT_B = makeObjectId("tenant-b");

function tenantDoc() {
  return makeUser({ _id: TENANT_USER_ID, role: "tenant" });
}

function ownerDoc() {
  return makeUser({ _id: OWNER_ID, role: "owner" });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/tenant/me/invoices", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/tenant/me/invoices"));
    expect(res.status).toBe(401);
  });

  it("403 for a non-tenant role (owner)", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    const res = await GET(
      buildRequest("/api/v1/tenant/me/invoices", { token: signToken(OWNER_ID) }),
    );
    expect(res.status).toBe(403);
  });

  it("200 with an empty page when the user maps to no tenant rows", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    tenantStub.find.mockReturnValue(buildQuery([]));
    const res = await GET(
      buildRequest("/api/v1/tenant/me/invoices", { token: signToken(TENANT_USER_ID) }),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data).toEqual([]);
    expect(body.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPrevPage: false,
    });
    expect(invoiceStub.find).not.toHaveBeenCalled();
  });

  it("filters by the tenant rows bound to the user", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }, { _id: TENANT_B }]));
    invoiceStub.find.mockReturnValue(buildQuery([]).sort({ issuedAt: -1 }).skip(0).limit(10));
    invoiceStub.countDocuments.mockResolvedValue(0);

    const res = await GET(
      buildRequest("/api/v1/tenant/me/invoices", { token: signToken(TENANT_USER_ID) }),
    );
    expect(res.status).toBe(200);
    expect(tenantStub.find).toHaveBeenCalledWith({ userId: TENANT_USER_ID });
    expect(invoiceStub.find).toHaveBeenCalledWith({ tenantId: { $in: [TENANT_A, TENANT_B] } });
  });

  it("appends period and status filters when present", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    invoiceStub.find.mockReturnValue(buildQuery([]).sort({ issuedAt: -1 }).skip(0).limit(10));
    invoiceStub.countDocuments.mockResolvedValue(0);

    const res = await GET(
      buildRequest("/api/v1/tenant/me/invoices?period=2026-09&status=pending", {
        token: signToken(TENANT_USER_ID),
      }),
    );
    expect(res.status).toBe(200);
    expect(invoiceStub.find).toHaveBeenCalledWith({
      tenantId: { $in: [TENANT_A] },
      period: "2026-09",
      status: "pending",
    });
  });

  it("derives the overdue filter as pending-and-dueDate-past", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    invoiceStub.find.mockReturnValue(buildQuery([]).sort({ issuedAt: -1 }).skip(0).limit(10));
    invoiceStub.countDocuments.mockResolvedValue(0);

    const res = await GET(
      buildRequest("/api/v1/tenant/me/invoices?status=overdue", {
        token: signToken(TENANT_USER_ID),
      }),
    );
    expect(res.status).toBe(200);
    const filter = invoiceStub.find.mock.calls[0][0] as { status: string; dueDate: { $lt: Date } };
    expect(filter.status).toBe("pending");
    expect(filter.dueDate.$lt).toBeInstanceOf(Date);
  });

  it("serializes the derived overdue status into the response", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    const invoice = makeInvoice({
      _id: makeObjectId("inv"),
      tenantId: TENANT_A,
      status: "pending",
      dueDate: new Date("2026-01-05T00:00:00.000Z"),
    });
    invoiceStub.find.mockReturnValue(
      buildQuery([invoice]).sort({ issuedAt: -1 }).skip(0).limit(10),
    );
    invoiceStub.countDocuments.mockResolvedValue(1);

    const res = await GET(
      buildRequest("/api/v1/tenant/me/invoices", { token: signToken(TENANT_USER_ID) }),
    );
    const body = await json(res);
    const data = body.data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(1);
    expect(data[0].status).toBe("overdue");
    expect(data[0].overdue).toBe(true);
  });
});
