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
vi.mock("@/lib/payments/owner-config", () => ({
  getOwnerPaymentConfig: vi.fn(),
  resolveDarajaConfig: vi.fn(),
}));

import { POST } from "@/app/api/v1/tenant/me/invoices/[id]/pay-mpesa/route";
import { resetDarajaTokenCache } from "@/lib/payments/mpesa";
import { getOwnerPaymentConfig, resolveDarajaConfig } from "@/lib/payments/owner-config";

const { user, tenant: tenantStub, invoice: invoiceStub, payment: paymentStub } = getModelStubs();
const getOwnerPaymentConfigMock = vi.mocked(getOwnerPaymentConfig);
const resolveDarajaConfigMock = vi.mocked(resolveDarajaConfig);

const INVOICE_ID = makeObjectId("invoice");
const OWNER_ID = makeObjectId("owner");
const TENANT_A = makeObjectId("tenant-a");
const INVALID_ID = "not-an-objectid";
const CHECKOUT_ID = "ws_CO_20092026120000123";

const DARAJA_CONFIG = {
  environment: "sandbox" as const,
  consumerKey: "key",
  consumerSecret: "secret",
  passphrase: "pass",
  shortcode: "174379",
};

function tenantUser(tag: string) {
  return makeUser({ _id: makeObjectId(`pm-${tag}`), role: "tenant" });
}

function pendingInvoice() {
  return makeInvoice({
    _id: INVOICE_ID,
    tenantId: TENANT_A,
    ownerId: OWNER_ID,
    status: "pending",
    amountDue: 25000,
  });
}

function stubDarajaPush(ok = true) {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ access_token: "token-123", expires_in: "3599" }),
      })
      .mockResolvedValueOnce({
        ok,
        status: ok ? 200 : 400,
        json: vi.fn().mockResolvedValue(
          ok
            ? {
                MerchantRequestID: "merchant-1",
                CheckoutRequestID: CHECKOUT_ID,
                ResponseCode: "0",
                ResponseDescription: "Success",
                CustomerMessage: "Prompt sent",
              }
            : { ResponseCode: "1", ResponseDescription: "Rejected" },
        ),
      }),
  );
}

function standardStubs(actor: ReturnType<typeof tenantUser>) {
  user.findById.mockReturnValue(buildQuery(actor));
  tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
  invoiceStub.findOne.mockReturnValue(buildQuery(pendingInvoice()));
  paymentStub.findOne.mockReturnValue(buildQuery(null));
  paymentStub.updateMany.mockResolvedValue({ modifiedCount: 0 });
  getOwnerPaymentConfigMock.mockResolvedValue({ darajaEnabled: true });
  resolveDarajaConfigMock.mockReturnValue(DARAJA_CONFIG);
}

async function json(res: Response) {
  return (await res.json()) as { data?: Record<string, unknown>; error?: string };
}

function post(body: unknown, token: string, id = INVOICE_ID) {
  return POST(
    buildRequest(`/api/v1/tenant/me/invoices/${id}/pay-mpesa`, {
      method: "POST",
      token,
      body,
    }),
    withParams(id),
  );
}

describe("POST /api/v1/tenant/me/invoices/[id]/pay-mpesa", () => {
  beforeEach(() => {
    resetModelStubs();
    resetDarajaTokenCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("401 when unauthenticated", async () => {
    const res = await post({ phone: "+254712345678" }, "");
    expect(res.status).toBe(401);
  });

  it("403 for a mismatched origin", async () => {
    const actor = tenantUser("origin");
    const res = await POST(
      buildRequest(`/api/v1/tenant/me/invoices/${INVOICE_ID}/pay-mpesa`, {
        method: "POST",
        token: signToken(actor._id),
        headers: { origin: "http://evil.example" },
        body: { phone: "+254712345678" },
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(403);
  });

  it("403 for a non-tenant role", async () => {
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: makeObjectId("pm-owner"), role: "owner" })),
    );
    const res = await post({ phone: "+254712345678" }, signToken(makeObjectId("pm-owner")));
    expect(res.status).toBe(403);
  });

  it("400 for an invalid invoice id", async () => {
    const res = await post(
      { phone: "+254712345678" },
      signToken(tenantUser("badid")._id),
      INVALID_ID,
    );
    expect(res.status).toBe(400);
    await expect(json(res)).resolves.toEqual({ error: "Invalid invoice id" });
  });

  it("404 for an invoice that is not the tenant's", async () => {
    const actor = tenantUser("foreign");
    user.findById.mockReturnValue(buildQuery(actor));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    invoiceStub.findOne.mockReturnValue(buildQuery(null));
    const res = await post({ phone: "+254712345678" }, signToken(actor._id));
    expect(res.status).toBe(404);
    await expect(json(res)).resolves.toEqual({ error: "Invoice not found" });
  });

  it("409 for an already-paid invoice", async () => {
    const actor = tenantUser("paid");
    user.findById.mockReturnValue(buildQuery(actor));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    invoiceStub.findOne.mockReturnValue(
      buildQuery(makeInvoice({ _id: INVOICE_ID, tenantId: TENANT_A, status: "paid" })),
    );
    const res = await post({ phone: "+254712345678" }, signToken(actor._id));
    expect(res.status).toBe(409);
    await expect(json(res)).resolves.toEqual({ error: "Invoice is already paid" });
    expect(paymentStub.create).not.toHaveBeenCalled();
  });

  it("503 when the owner has no Daraja configuration", async () => {
    const actor = tenantUser("noconfig");
    user.findById.mockReturnValue(buildQuery(actor));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    invoiceStub.findOne.mockReturnValue(buildQuery(pendingInvoice()));
    getOwnerPaymentConfigMock.mockResolvedValue(null);
    resolveDarajaConfigMock.mockReturnValue(null);
    const res = await post({ phone: "+254712345678" }, signToken(actor._id));
    expect(res.status).toBe(503);
    await expect(json(res)).resolves.toEqual({
      error: "M-Pesa is not configured for this property owner",
    });
    expect(paymentStub.create).not.toHaveBeenCalled();
  });

  it("400 for an invalid phone number", async () => {
    const actor = tenantUser("badphone");
    standardStubs(actor);
    const res = await post({ phone: "hello" }, signToken(actor._id));
    expect(res.status).toBe(400);
    await expect(json(res)).resolves.toEqual(
      expect.objectContaining({ error: "Invalid payment payload" }),
    );
    expect(paymentStub.create).not.toHaveBeenCalled();
  });

  it("409 when another provider's payment is already in progress", async () => {
    const actor = tenantUser("busy");
    standardStubs(actor);
    paymentStub.findOne.mockReturnValue(
      buildQuery(
        makePayment({
          invoiceId: INVOICE_ID,
          provider: "paystack",
          status: "pending",
          expiresAt: new Date(Date.now() + 60_000),
        }),
      ),
    );
    const res = await post({ phone: "+254712345678" }, signToken(actor._id));
    expect(res.status).toBe(409);
    await expect(json(res)).resolves.toEqual({
      error: "Another payment is already in progress for this invoice",
    });
    expect(paymentStub.create).not.toHaveBeenCalled();
  });

  it("reuses a live pending M-Pesa attempt instead of sending a second prompt", async () => {
    const actor = tenantUser("reuse");
    standardStubs(actor);
    const stored = makePayment({
      _id: makeObjectId("payment"),
      provider: "mpesa",
      providerReference: CHECKOUT_ID,
      invoiceId: INVOICE_ID,
      tenantId: TENANT_A,
      status: "pending",
      expiresAt: new Date(Date.now() + 60_000),
    });
    paymentStub.findOne.mockReturnValue(buildQuery(stored));

    const res = await post({ phone: "+254712345678" }, signToken(actor._id));
    expect(res.status).toBe(200);
    const data = (await json(res)).data as Record<string, unknown>;
    expect(data.paymentId).toBe(stored._id);
    expect(data.reference).toBe(CHECKOUT_ID);
    expect(paymentStub.create).not.toHaveBeenCalled();
  });

  it("200 sends the STK push and records a pending payment keyed by CheckoutRequestID", async () => {
    stubDarajaPush();
    const actor = tenantUser("ok");
    standardStubs(actor);
    paymentStub.create.mockResolvedValue(
      makePayment({
        _id: makeObjectId("payment"),
        provider: "mpesa",
        providerReference: CHECKOUT_ID,
        invoiceId: INVOICE_ID,
        tenantId: TENANT_A,
        status: "pending",
      }),
    );

    const res = await post({ phone: "+254712345678" }, signToken(actor._id));

    expect(res.status).toBe(200);
    const data = (await json(res)).data as Record<string, unknown>;
    expect(data.reference).toBe(CHECKOUT_ID);
    expect(data.status).toBe("pending");
    expect(paymentStub.create).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "mpesa",
        providerReference: CHECKOUT_ID,
        invoiceId: INVOICE_ID,
        tenantId: TENANT_A,
        amountMinor: 2500000,
        currency: "KES",
        status: "pending",
      }),
    );

    const [pushUrl, pushInit] = vi.mocked(fetch).mock.calls[1] as [string, RequestInit];
    expect(pushUrl).toBe("https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest");
    const pushBody = JSON.parse(String(pushInit.body)) as Record<string, unknown>;
    expect(pushBody.Amount).toBe(25000);
    expect(pushBody.PhoneNumber).toBe("254712345678");
    // The callback URL is signed with a per-owner HMAC token.
    expect(String(pushBody.CallBackURL)).toMatch(
      new RegExp(`/api/v1/payments/mpesa/callback/${OWNER_ID}/[a-f0-9]{64}$`),
    );
  });

  it("502 when Daraja rejects the push", async () => {
    stubDarajaPush(false);
    const actor = tenantUser("providerfail");
    standardStubs(actor);
    const res = await post({ phone: "+254712345678" }, signToken(actor._id));
    expect(res.status).toBe(502);
    await expect(json(res)).resolves.toEqual({ error: "Payment provider error" });
    expect(paymentStub.create).not.toHaveBeenCalled();
  });

  it("429 after the per-user rate limit is exhausted", async () => {
    stubDarajaPush();
    const actor = tenantUser("rl");
    standardStubs(actor);
    paymentStub.create.mockResolvedValue(
      makePayment({
        _id: makeObjectId("payment"),
        provider: "mpesa",
        providerReference: CHECKOUT_ID,
        invoiceId: INVOICE_ID,
        tenantId: TENANT_A,
      }),
    );

    let lastStatus = 0;
    for (let i = 0; i < 6; i += 1) {
      const res = await post({ phone: "+254712345678" }, signToken(actor._id));
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
