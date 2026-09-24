/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeInvoice, makeObjectId, makePayment, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));
vi.mock("@/models/Invoice", () => ({ Invoice: getModelStubs().invoice }));
vi.mock("@/models/Payment", () => ({ Payment: getModelStubs().payment }));

import { POST } from "@/app/api/v1/tenant/me/invoices/[id]/pay-initiate/route";

const { user, tenant: tenantStub, invoice: invoiceStub, payment: paymentStub } = getModelStubs();

const SECRET = "FAKE_PAYMENT_SECRET_FOR_TESTS";
const INVOICE_ID = makeObjectId("invoice");
const TENANT_A = makeObjectId("tenant-a");
const INVALID_ID = "not-an-objectid";
const CHECKOUT_URL = "https://checkout.paystack.com/ky94941x";
const REF_REFERENCE = "KY-reuse-1a2b3c4d";

// The rate limiter is user-keyed (5/min) on a module-global store, so every
// test gets its own tenant userId to avoid sharing a throttle bucket.
function tenantUser(tag: string) {
  return makeUser({ _id: makeObjectId(`pi-${tag}`), role: "tenant" });
}

function pendingInvoice() {
  return makeInvoice({ _id: INVOICE_ID, tenantId: TENANT_A, status: "pending", amountDue: 25000 });
}

function stubPaystackCheckout() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        status: true,
        message: "Authorization URL created",
        data: { reference: "ignored", authorization_url: CHECKOUT_URL, access_code: "code1" },
      }),
    }),
  );
}

function standardStubs(userDoc: ReturnType<typeof tenantUser>) {
  user.findById.mockReturnValue(buildQuery(userDoc));
  tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
  invoiceStub.findOne.mockReturnValue(buildQuery(pendingInvoice()));
  paymentStub.findOne.mockReturnValue(buildQuery(null));
  paymentStub.updateMany.mockResolvedValue({ modifiedCount: 0 });
}

async function json(res: Response) {
  return (await res.json()) as { data?: Record<string, unknown>; error?: string };
}

describe("POST /api/v1/tenant/me/invoices/[id]/pay-initiate", () => {
  beforeEach(() => {
    resetModelStubs();
    process.env.PAYSTACK_SECRET_KEY = SECRET;
  });
  afterEach(() => {
    delete process.env.PAYSTACK_SECRET_KEY;
    vi.unstubAllGlobals();
  });

  it("401 when unauthenticated", async () => {
    const res = await POST(
      buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}/pay-initiate`, {
        method: "POST",
        body: {},
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(401);
  });

  it("403 for a mismatched origin", async () => {
    const res = await POST(
      buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}/pay-initiate`, {
        method: "POST",
        token: signToken(tenantUser("origin")._id),
        headers: { origin: "http://evil.example" },
        body: {},
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(403);
  });

  it("403 for a non-tenant role", async () => {
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: makeObjectId("pi-owner"), role: "owner" })),
    );
    const res = await POST(
      buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}/pay-initiate`, {
        method: "POST",
        token: signToken(makeObjectId("pi-owner")),
        body: {},
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(403);
  });

  it("400 for an invalid invoice id", async () => {
    const res = await POST(
      buildRequest(`/api/v1/tenant/me/invoices/${INVALID_ID}/pay-initiate`, {
        method: "POST",
        token: signToken(tenantUser("badid")._id),
        body: {},
      }),
      withParams(INVALID_ID),
    );
    expect(res.status).toBe(400);
    await expect(json(res)).resolves.toEqual({ error: "Invalid invoice id" });
  });

  it("404 for an invoice that is not the tenant's", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser("foreign")));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    invoiceStub.findOne.mockReturnValue(buildQuery(null));
    const res = await POST(
      buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}/pay-initiate`, {
        method: "POST",
        token: signToken(tenantUser("foreign")._id),
        body: {},
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(404);
    await expect(json(res)).resolves.toEqual({ error: "Invoice not found" });
  });

  it("409 for an already-paid invoice", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser("paid")));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    invoiceStub.findOne.mockReturnValue(
      buildQuery(makeInvoice({ _id: INVOICE_ID, tenantId: TENANT_A, status: "paid" })),
    );
    const res = await POST(
      buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}/pay-initiate`, {
        method: "POST",
        token: signToken(tenantUser("paid")._id),
        body: {},
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(409);
    await expect(json(res)).resolves.toEqual({ error: "Invoice is already paid" });
    expect(paymentStub.create).not.toHaveBeenCalled();
  });

  it("409 for a void invoice", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser("void")));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    invoiceStub.findOne.mockReturnValue(
      buildQuery(makeInvoice({ _id: INVOICE_ID, tenantId: TENANT_A, status: "void" })),
    );
    const res = await POST(
      buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}/pay-initiate`, {
        method: "POST",
        token: signToken(tenantUser("void")._id),
        body: {},
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(409);
    await expect(json(res)).resolves.toEqual({ error: "Invoice is void" });
  });

  it("409 for a draft invoice", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser("draft")));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    invoiceStub.findOne.mockReturnValue(
      buildQuery(makeInvoice({ _id: INVOICE_ID, tenantId: TENANT_A, status: "draft" })),
    );
    const res = await POST(
      buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}/pay-initiate`, {
        method: "POST",
        token: signToken(tenantUser("draft")._id),
        body: {},
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(409);
    await expect(json(res)).resolves.toEqual({ error: "Draft invoices cannot be paid online" });
  });

  it("409 for a partially-paid invoice", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser("partial")));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    invoiceStub.findOne.mockReturnValue(
      buildQuery(
        makeInvoice({ _id: INVOICE_ID, tenantId: TENANT_A, status: "pending", amountPaid: 5000 }),
      ),
    );
    const res = await POST(
      buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}/pay-initiate`, {
        method: "POST",
        token: signToken(tenantUser("partial")._id),
        body: {},
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(409);
    await expect(json(res)).resolves.toEqual({ error: "Invoice is not payable online" });
  });

  it("503 when Paystack keys are not configured", async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    user.findById.mockReturnValue(buildQuery(tenantUser("nokeys")));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    invoiceStub.findOne.mockReturnValue(buildQuery(pendingInvoice()));
    const res = await POST(
      buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}/pay-initiate`, {
        method: "POST",
        token: signToken(tenantUser("nokeys")._id),
        body: {},
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(503);
    await expect(json(res)).resolves.toEqual({ error: "Online payments are not configured" });
    expect(paymentStub.create).not.toHaveBeenCalled();
  });

  it("200 creates a pending payment and returns the checkout URL", async () => {
    stubPaystackCheckout();
    const actor = tenantUser("ok");
    standardStubs(actor);
    const created = makePayment({
      _id: makeObjectId("payment"),
      providerReference: "KY-created-ref",
      invoiceId: INVOICE_ID,
      tenantId: TENANT_A,
      status: "pending",
    });
    paymentStub.create.mockResolvedValue(created);
    paymentStub.updateOne.mockResolvedValue(undefined);

    const res = await POST(
      buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}/pay-initiate`, {
        method: "POST",
        token: signToken(actor._id),
        body: {},
      }),
      withParams(INVOICE_ID),
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    const data = body.data as Record<string, unknown>;
    expect(String(data.reference)).toMatch(new RegExp(`^KY-${INVOICE_ID}-[0-9a-f]{8}$`));
    expect(data.authorizationUrl).toBe(CHECKOUT_URL);
    expect(paymentStub.updateMany).toHaveBeenCalledWith(
      { invoiceId: INVOICE_ID, status: "pending", expiresAt: { $lte: expect.any(Date) } },
      { $set: { status: "abandoned" } },
    );
    expect(paymentStub.create).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "paystack",
        invoiceId: INVOICE_ID,
        tenantId: TENANT_A,
        amountMinor: 2500000,
        currency: "KES",
        status: "pending",
      }),
    );
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.paystack.co/transaction/initialize");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRET}`);
    expect(paymentStub.updateOne).toHaveBeenCalledWith(
      { _id: created._id },
      expect.objectContaining({
        $set: expect.objectContaining({ authorizationUrl: CHECKOUT_URL }),
      }),
    );
  });

  it("derives the charge amount server-side regardless of client fields", async () => {
    stubPaystackCheckout();
    const actor = tenantUser("amount");
    standardStubs(actor);
    paymentStub.create.mockResolvedValue(
      makePayment({
        _id: makeObjectId("payment"),
        invoiceId: INVOICE_ID,
        tenantId: TENANT_A,
        status: "pending",
      }),
    );
    paymentStub.updateOne.mockResolvedValue(undefined);

    const res = await POST(
      buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}/pay-initiate`, {
        method: "POST",
        token: signToken(actor._id),
        body: { amount: 1, method: "Card" },
      }),
      withParams(INVOICE_ID),
    );

    expect(res.status).toBe(200);
    expect(paymentStub.create).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinor: 2500000 }),
    );
  });

  it("reuses an unexpired pending checkout instead of stacking a second", async () => {
    const actor = tenantUser("reuse");
    user.findById.mockReturnValue(buildQuery(actor));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    invoiceStub.findOne.mockReturnValue(buildQuery(pendingInvoice()));
    const stored = makePayment({
      _id: makeObjectId("payment"),
      providerReference: REF_REFERENCE,
      invoiceId: INVOICE_ID,
      tenantId: TENANT_A,
      status: "pending",
      authorizationUrl: "https://checkout.paystack.com/stored",
      expiresAt: new Date(Date.now() + 60_000),
    });
    paymentStub.findOne.mockReturnValue(buildQuery(stored));

    const res = await POST(
      buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}/pay-initiate`, {
        method: "POST",
        token: signToken(actor._id),
        body: {},
      }),
      withParams(INVOICE_ID),
    );

    expect(res.status).toBe(200);
    const data = (await json(res)).data as Record<string, unknown>;
    expect(data.paymentId).toBe(stored._id);
    expect(data.authorizationUrl).toBe("https://checkout.paystack.com/stored");
    expect(paymentStub.create).not.toHaveBeenCalled();
    expect(paymentStub.updateMany).not.toHaveBeenCalled();
    expect(paymentStub.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "paystack",
        invoiceId: INVOICE_ID,
        status: "pending",
        expiresAt: { $gt: expect.any(Date) },
      }),
    );
  });

  it("two concurrent initiates mint exactly one pending row and both get a checkout URL", async () => {
    stubPaystackCheckout();
    const actor = tenantUser("conc");
    user.findById.mockReturnValue(buildQuery(actor));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    invoiceStub.findOne.mockReturnValue(buildQuery(pendingInvoice()));
    paymentStub.updateMany.mockResolvedValue({ modifiedCount: 0 });
    paymentStub.updateOne.mockResolvedValue(undefined);

    const winner = makePayment({
      _id: makeObjectId("payment"),
      providerReference: "KY-winner-ref",
      invoiceId: INVOICE_ID,
      tenantId: TENANT_A,
      status: "pending",
      authorizationUrl: CHECKOUT_URL,
      expiresAt: new Date(Date.now() + 60_000),
    });

    // Winner: the existing-row read misses (null). Loser: its read also misses
    // before the winner's row is committed, its insert collides on the unique
    // pending-per-invoice index, the provider-reference lookup misses, and the
    // survivor re-read returns the winner's single pending row.
    paymentStub.findOne
      .mockReturnValueOnce(buildQuery(null))
      .mockReturnValueOnce(buildQuery(null))
      .mockReturnValueOnce(buildQuery(null))
      .mockReturnValueOnce(buildQuery(winner));
    paymentStub.create.mockResolvedValueOnce(winner).mockRejectedValueOnce({ code: 11000 });

    const winnerRes = await POST(
      buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}/pay-initiate`, {
        method: "POST",
        token: signToken(actor._id),
        body: {},
      }),
      withParams(INVOICE_ID),
    );
    const loserRes = await POST(
      buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}/pay-initiate`, {
        method: "POST",
        token: signToken(actor._id),
        body: {},
      }),
      withParams(INVOICE_ID),
    );

    expect(winnerRes.status).toBe(200);
    expect(loserRes.status).toBe(200);
    const winnerBody = (await json(winnerRes)).data as Record<string, unknown>;
    const loserBody = (await json(loserRes)).data as Record<string, unknown>;
    expect(winnerBody.authorizationUrl).toBe(CHECKOUT_URL);
    expect(loserBody.authorizationUrl).toBe(CHECKOUT_URL);
    // The loser converged on the winner's single pending row instead of
    // stacking a second checkout.
    expect(loserBody.paymentId).toBe(winner._id);

    expect(paymentStub.create).toHaveBeenCalledTimes(2);
    expect(paymentStub.findOne).toHaveBeenLastCalledWith({
      invoiceId: INVOICE_ID,
      status: "pending",
    });
  });

  it("429 after the per-user rate limit is exhausted", async () => {
    stubPaystackCheckout();
    const actor = tenantUser("rl");
    standardStubs(actor);
    paymentStub.create.mockResolvedValue(
      makePayment({ _id: makeObjectId("payment"), invoiceId: INVOICE_ID, tenantId: TENANT_A }),
    );
    paymentStub.updateOne.mockResolvedValue(undefined);

    let lastStatus = 0;
    for (let i = 0; i < 6; i += 1) {
      const res = await POST(
        buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}/pay-initiate`, {
          method: "POST",
          token: signToken(actor._id),
          body: {},
        }),
        withParams(INVOICE_ID),
      );
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
