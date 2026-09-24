/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeInvoice, makeObjectId, makePayment, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notifications", () => ({
  notifyInvoicePaid: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));
vi.mock("@/models/Invoice", () => ({ Invoice: getModelStubs().invoice }));
// serializePayment is real; only the model constructor is stubbed.
vi.mock("@/models/Payment", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/models/Payment")>();
  return { ...mod, Payment: getModelStubs().payment };
});
vi.mock("@/lib/payments/paystack", () => ({ verify: vi.fn() }));

import { GET } from "@/app/api/v1/tenant/me/payments/status/route";
import { notifyInvoicePaid } from "@/lib/notifications";
import { verify } from "@/lib/payments/paystack";

const { user, tenant: tenantStub, invoice: invoiceStub, payment: paymentStub } = getModelStubs();
const verifyMock = vi.mocked(verify);
const notifyInvoicePaidMock = vi.mocked(notifyInvoicePaid);

const TENANT_USER_ID = makeObjectId("status-tenant");
const OWNER_ID = makeObjectId("status-owner");
const TENANT_A = makeObjectId("tenant-a");
const INVOICE_ID = makeObjectId("invoice");
const PAYMENT_ID = makeObjectId("payment");
const REFERENCE = "KY-abc123-1a2b3c4d";

function tenantDoc() {
  return makeUser({ _id: TENANT_USER_ID, role: "tenant" });
}

function ownerDoc() {
  return makeUser({ _id: OWNER_ID, role: "owner" });
}

function pendingPayment() {
  return makePayment({
    _id: PAYMENT_ID,
    providerReference: REFERENCE,
    invoiceId: INVOICE_ID,
    tenantId: TENANT_A,
    status: "pending",
    rawEvent: { deep: "audit-trail" },
  });
}

function successPayment() {
  return makePayment({
    ...pendingPayment(),
    status: "success",
    paidAt: new Date("2026-09-20T12:00:00.000Z"),
    lastEvent: "verify",
  });
}

function pendingInvoice() {
  return makeInvoice({ _id: INVOICE_ID, tenantId: TENANT_A, status: "pending", amountDue: 25000 });
}

function paidInvoice() {
  return makeInvoice({
    _id: INVOICE_ID,
    tenantId: TENANT_A,
    status: "paid",
    amountDue: 25000,
    amountPaid: 25000,
  });
}

async function json(res: Response) {
  return (await res.json()) as {
    data?: { payment?: Record<string, unknown>; invoice?: Record<string, unknown> };
    error?: string;
  };
}

describe("GET /api/v1/tenant/me/payments/status", () => {
  beforeEach(() => {
    resetModelStubs();
    verifyMock.mockReset();
    notifyInvoicePaidMock.mockClear();
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest(`/api/v1/tenant/me/payments/status?reference=${REFERENCE}`));
    expect(res.status).toBe(401);
  });

  it("403 for a non-tenant role", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    const res = await GET(
      buildRequest(`/api/v1/tenant/me/payments/status?reference=${REFERENCE}`, {
        token: signToken(OWNER_ID),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("400 for an invalid reference", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    const res = await GET(
      buildRequest("/api/v1/tenant/me/payments/status?reference=not%20ok", {
        token: signToken(TENANT_USER_ID),
      }),
    );
    expect(res.status).toBe(400);
    await expect(json(res)).resolves.toEqual({ error: "Invalid reference" });
  });

  it("404 for an unknown payment reference", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    paymentStub.findOne.mockReturnValue(buildQuery(null));
    const res = await GET(
      buildRequest(`/api/v1/tenant/me/payments/status?reference=${REFERENCE}`, {
        token: signToken(TENANT_USER_ID),
      }),
    );
    expect(res.status).toBe(404);
    await expect(json(res)).resolves.toEqual({ error: "Payment not found" });
  });

  it("404 for a payment owned by another tenant", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    paymentStub.findOne.mockReturnValue(
      buildQuery(makePayment({ _id: PAYMENT_ID, tenantId: makeObjectId("other-tenant") })),
    );
    const res = await GET(
      buildRequest(`/api/v1/tenant/me/payments/status?reference=${REFERENCE}`, {
        token: signToken(TENANT_USER_ID),
      }),
    );
    expect(res.status).toBe(404);
    await expect(json(res)).resolves.toEqual({ error: "Payment not found" });
  });

  it("200 verifies a pending payment and settles the invoice", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    paymentStub.findOne.mockReturnValue(buildQuery(pendingPayment()));
    verifyMock.mockResolvedValue({
      status: "success",
      amountMinor: 2500000,
      currency: "KES",
      channel: "card",
      paidAt: new Date("2026-09-20T12:00:00.000Z"),
    });
    // settle reads the invoice, then the route refetches it as paid.
    invoiceStub.findById
      .mockReturnValueOnce(buildQuery(pendingInvoice()))
      .mockReturnValue(buildQuery(paidInvoice()));
    invoiceStub.findOneAndUpdate.mockReturnValue(buildQuery(paidInvoice()));
    paymentStub.updateOne.mockResolvedValue(undefined);
    paymentStub.findById.mockReturnValue(buildQuery(successPayment()));

    const res = await GET(
      buildRequest(`/api/v1/tenant/me/payments/status?reference=${REFERENCE}`, {
        token: signToken(TENANT_USER_ID),
      }),
    );

    expect(res.status).toBe(200);
    expect(verifyMock).toHaveBeenCalledWith(REFERENCE);
    const body = await json(res);
    expect((body.data as { payment: Record<string, unknown> }).payment.status).toBe("success");
    expect((body.data as { payment: Record<string, unknown> }).payment.rawEvent).toBeUndefined();
    expect((body.data as { invoice: Record<string, unknown> }).invoice.status).toBe("paid");
    expect(notifyInvoicePaidMock).toHaveBeenCalledTimes(1);
  });

  it("200 reports the invoice as unpaid when the verified amount mismatches", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    paymentStub.findOne.mockReturnValue(buildQuery(pendingPayment()));
    verifyMock.mockResolvedValue({
      status: "success",
      amountMinor: 2400000,
      currency: "KES",
      channel: "bank_transfer",
      paidAt: new Date("2026-09-20T12:00:00.000Z"),
    });
    // Both the settle read and the final read see a still-pending invoice.
    invoiceStub.findById.mockReturnValue(buildQuery(pendingInvoice()));
    paymentStub.updateOne.mockResolvedValue(undefined);
    invoiceStub.updateOne.mockResolvedValue(undefined);
    paymentStub.findById.mockReturnValue(buildQuery(successPayment()));

    const res = await GET(
      buildRequest(`/api/v1/tenant/me/payments/status?reference=${REFERENCE}`, {
        token: signToken(TENANT_USER_ID),
      }),
    );

    expect(res.status).toBe(200);
    expect(invoiceStub.findOneAndUpdate).not.toHaveBeenCalled();
    expect(notifyInvoicePaidMock).not.toHaveBeenCalled();
    const body = await json(res);
    expect((body.data as { payment: Record<string, unknown> }).payment.status).toBe("success");
    expect((body.data as { invoice: Record<string, unknown> }).invoice.status).toBe("pending");
  });

  it("200 reports current state when the provider verify call fails", async () => {
    user.findById.mockReturnValue(buildQuery(tenantDoc()));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    paymentStub.findOne.mockReturnValue(buildQuery(pendingPayment()));
    verifyMock.mockRejectedValue(new Error("network down"));
    invoiceStub.findById.mockReturnValue(buildQuery(pendingInvoice()));
    paymentStub.findById.mockReturnValue(buildQuery(pendingPayment()));

    const res = await GET(
      buildRequest(`/api/v1/tenant/me/payments/status?reference=${REFERENCE}`, {
        token: signToken(TENANT_USER_ID),
      }),
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    expect((body.data as { payment: Record<string, unknown> }).payment.status).toBe("pending");
    expect(invoiceStub.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("429 after the per-user rate limit is exhausted", async () => {
    const limitUserId = makeObjectId("status-ratelimit");
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: limitUserId, role: "tenant" })));
    tenantStub.find.mockReturnValue(buildQuery([{ _id: TENANT_A }]));
    paymentStub.findOne.mockReturnValue(buildQuery(successPayment()));
    paymentStub.findById.mockReturnValue(buildQuery(successPayment()));
    invoiceStub.findById.mockReturnValue(buildQuery(paidInvoice()));

    let lastStatus = 0;
    for (let i = 0; i < 31; i += 1) {
      const res = await GET(
        buildRequest(`/api/v1/tenant/me/payments/status?reference=${REFERENCE}`, {
          token: signToken(limitUserId),
        }),
      );
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
