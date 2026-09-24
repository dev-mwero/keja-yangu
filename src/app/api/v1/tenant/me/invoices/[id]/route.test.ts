/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeInvoice, makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));
vi.mock("@/models/Invoice", () => ({ Invoice: getModelStubs().invoice }));

import { GET, POST } from "@/app/api/v1/tenant/me/invoices/[id]/route";

const { user, tenant: tenantStub, invoice: invoiceStub } = getModelStubs();

const TENANT_USER_ID = makeObjectId("tenant-user");
const OWNER_ID = makeObjectId("owner");
const TENANT_A = makeObjectId("tenant-a");
const INVOICE_ID = makeObjectId("invoice");
const INVALID_ID = "not-an-objectid";

function tenantDoc() {
  return makeUser({ _id: TENANT_USER_ID, role: "tenant" });
}

function ownerDoc() {
  return makeUser({ _id: OWNER_ID, role: "owner" });
}

function pendingInvoice() {
  return makeInvoice({
    _id: INVOICE_ID,
    tenantId: TENANT_A,
    status: "pending",
    amountDue: 25000,
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/tenant/me/invoices/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("400 for an invalid id", async () => {
    const res = await GET(
      buildRequest(`/api/v1/tenant/me/invoices/${INVALID_ID}`),
      withParams(INVALID_ID),
    );
    expect(res.status).toBe(400);
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(
      buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}`),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(401);
  });

  it("403 for a non-tenant role", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    const res = await GET(
      buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}`, { token: signToken(OWNER_ID) }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(403);
  });

  it("404 for an invoice not bound to any of the user's tenants", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    invoiceStub.findOne.mockReturnValue(buildQuery(null));
    const res = await GET(
      buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}`, {
        token: signToken(TENANT_USER_ID),
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.error).toBe("Invoice not found");
  });

  it("200 for an invoice bound to one of the user's tenants", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    invoiceStub.findOne.mockReturnValue(buildQuery(pendingInvoice()));
    const res = await GET(
      buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}`, {
        token: signToken(TENANT_USER_ID),
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(200);
    expect(invoiceStub.findOne).toHaveBeenCalledWith({
      _id: INVOICE_ID,
      tenantId: { $in: [TENANT_A] },
    });
    const body = await json(res);
    expect((body.data as { tenantId?: string }).tenantId).toBe(TENANT_A);
  });
});

describe("POST /api/v1/tenant/me/invoices/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("403 for a mismatched origin", async () => {
    const res = await POST(
      buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}`, {
        method: "POST",
        token: signToken(TENANT_USER_ID),
        headers: { origin: "http://evil.example" },
        body: {},
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(403);
  });

  it("401 when unauthenticated", async () => {
    const res = await POST(
      buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}`, { method: "POST", body: {} }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(401);
  });

  it("400 for an invalid id", async () => {
    const res = await POST(
      buildRequest(`/api/v1/tenant/me/invoices/${INVALID_ID}`, {
        method: "POST",
        token: signToken(TENANT_USER_ID),
        body: {},
      }),
      withParams(INVALID_ID),
    );
    expect(res.status).toBe(400);
  });

  it("404 for an invoice that is not the tenant's", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    invoiceStub.findOne.mockReturnValue(buildQuery(null));
    const res = await POST(
      buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}`, {
        method: "POST",
        token: signToken(TENANT_USER_ID),
        body: {},
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(404);
  });

  it("200 marks the invoice paid as the tenant", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    invoiceStub.findOne.mockReturnValue(buildQuery(pendingInvoice()));
    invoiceStub.findOneAndUpdate.mockReturnValue(
      buildQuery({ ...pendingInvoice(), status: "paid", amountPaid: 25000 }),
    );

    const res = await POST(
      buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}`, {
        method: "POST",
        token: signToken(TENANT_USER_ID),
        body: { method: "M-Pesa", notes: "paid from portal" },
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(200);
    const updateData = invoiceStub.findOneAndUpdate.mock.calls[0][1] as Record<string, unknown>;
    expect(updateData.status).toBe("paid");
    expect(updateData.amountPaid).toBe(25000);
    expect(updateData.paidAt).toBeInstanceOf(Date);
    expect(updateData.paidBy).toBe(TENANT_USER_ID);
    expect(updateData.paidByRole).toBe("tenant");
    expect(updateData.method).toBe("M-Pesa");
    const body = await json(res);
    expect((body.data as { status?: string }).status).toBe("paid");
  });

  it("409 for an already-paid invoice", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    invoiceStub.findOne.mockReturnValue(
      buildQuery(makeInvoice({ _id: INVOICE_ID, tenantId: TENANT_A, status: "paid" })),
    );
    const res = await POST(
      buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}`, {
        method: "POST",
        token: signToken(TENANT_USER_ID),
        body: {},
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error).toBe("Invoice is already paid");
  });

  it("409 for a void invoice", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    invoiceStub.findOne.mockReturnValue(
      buildQuery(makeInvoice({ _id: INVOICE_ID, tenantId: TENANT_A, status: "void" })),
    );
    const res = await POST(
      buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}`, {
        method: "POST",
        token: signToken(TENANT_USER_ID),
        body: {},
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error).toBe("Invoice is void");
  });

  it("400 for an invalid payment payload", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    invoiceStub.findOne.mockReturnValue(buildQuery(pendingInvoice()));
    const res = await POST(
      buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}`, {
        method: "POST",
        token: signToken(TENANT_USER_ID),
        body: { method: "dogecoin" },
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid payment payload");
  });

  it("429 after the per-IP rate limit is exhausted", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    invoiceStub.findOne.mockReturnValue(buildQuery(null));
    let lastStatus = 0;
    for (let i = 0; i < 21; i += 1) {
      const res = await POST(
        buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}`, {
          method: "POST",
          token: signToken(TENANT_USER_ID),
          headers: { "x-forwarded-for": "203.0.113.16" },
          body: {},
        }),
        withParams(INVOICE_ID),
      );
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
