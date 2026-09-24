/** @vitest-environment node */
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest } from "@/test/utils/api-request";
import { makeInvoice, makeObjectId, makePayment } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notifications", () => ({
  notifyInvoicePaid: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/models/Payment", () => ({ Payment: getModelStubs().payment }));
vi.mock("@/models/Invoice", () => ({ Invoice: getModelStubs().invoice }));

import { POST } from "@/app/api/v1/payments/paystack/webhook/route";
import { connectToDatabase } from "@/lib/mongoose";
import { notifyInvoicePaid } from "@/lib/notifications";

const { payment: paymentStub, invoice: invoiceStub } = getModelStubs();
const notifyInvoicePaidMock = vi.mocked(notifyInvoicePaid);
const connectToDatabaseMock = vi.mocked(connectToDatabase);

const SECRET = "FAKE_PAYMENT_SECRET_FOR_TESTS";
const INVOICE_ID = makeObjectId("invoice");
const TENANT_A = makeObjectId("tenant-a");
const REFERENCE = "KY-abc123-1a2b3c4d";
const WEBHOOK_URL = "/api/v1/payments/paystack/webhook";

function sign(rawBody: string): string {
  return createHmac("sha512", SECRET).update(rawBody).digest("hex");
}

function chargeSuccess() {
  return {
    event: "charge.success",
    data: {
      reference: REFERENCE,
      status: "success",
      amount: 2500000,
      currency: "KES",
      channel: "card",
      paid_at: "2026-09-20T12:00:00.000Z",
    },
  };
}

function signedRequest(body: unknown) {
  const rawBody = JSON.stringify(body);
  return buildRequest(WEBHOOK_URL, {
    method: "POST",
    headers: { "x-paystack-signature": sign(rawBody) },
    body,
  });
}

function paymentDoc() {
  return makePayment({
    _id: makeObjectId("payment"),
    providerReference: REFERENCE,
    invoiceId: INVOICE_ID,
    tenantId: TENANT_A,
  });
}

function pendingInvoice() {
  return makeInvoice({
    _id: INVOICE_ID,
    tenantId: TENANT_A,
    status: "pending",
    amountDue: 25000,
    amountPaid: 0,
  });
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
  return (await res.json()) as Record<string, unknown>;
}

describe("POST /api/v1/payments/paystack/webhook", () => {
  beforeEach(() => {
    resetModelStubs();
    notifyInvoicePaidMock.mockClear();
    connectToDatabaseMock.mockClear();
    process.env.PAYSTACK_SECRET_KEY = SECRET;
  });
  afterEach(() => {
    delete process.env.PAYSTACK_SECRET_KEY;
  });

  it("401 without a signature", async () => {
    const res = await POST(buildRequest(WEBHOOK_URL, { method: "POST", body: chargeSuccess() }));
    expect(res.status).toBe(401);
    await expect(json(res)).resolves.toEqual({ error: "Invalid signature" });
    // Rejected before the body is buffered or any database work happens.
    expect(connectToDatabaseMock).not.toHaveBeenCalled();
  });

  it("413 without buffering when the declared content-length exceeds 1MB", async () => {
    const res = await POST(
      buildRequest(WEBHOOK_URL, {
        method: "POST",
        headers: { "content-length": String(1_200_000) },
        body: chargeSuccess(),
      }),
    );
    expect(res.status).toBe(413);
    await expect(json(res)).resolves.toEqual({ error: "Payload too large" });
    expect(connectToDatabaseMock).not.toHaveBeenCalled();
  });

  it("413 for a body over 1MB even with a valid signature", async () => {
    const res = await POST(
      buildRequest(WEBHOOK_URL, {
        method: "POST",
        headers: { "x-paystack-signature": sign(JSON.stringify(chargeSuccess())) },
        body: { data: "x".repeat(1_000_100) },
      }),
    );
    expect(res.status).toBe(413);
    await expect(json(res)).resolves.toEqual({ error: "Payload too large" });
    expect(connectToDatabaseMock).not.toHaveBeenCalled();
  });

  it("500 when the Paystack secret is not configured, not a signature 401", async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    const res = await POST(signedRequest(chargeSuccess()));
    expect(res.status).toBe(500);
    await expect(json(res)).resolves.toEqual({ error: "Online payments are not configured" });
    expect(connectToDatabaseMock).not.toHaveBeenCalled();
  });

  it("401 with a signature minted from a different secret", async () => {
    const rawBody = JSON.stringify(chargeSuccess());
    const foreign = createHmac("sha512", "ANOTHER_FAKE_SECRET").update(rawBody).digest("hex");
    const res = await POST(
      buildRequest(WEBHOOK_URL, {
        method: "POST",
        headers: { "x-paystack-signature": foreign },
        body: chargeSuccess(),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("400 for well-formed JSON that fails envelope validation", async () => {
    const res = await POST(signedRequest({ foo: "bar" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid payload");
    expect(connectToDatabaseMock).not.toHaveBeenCalled();
  });

  it("200 + received for unparseable bytes under a valid signature", async () => {
    const rawBody = '{"event":"charge.success","data":';
    const request = new NextRequest(`http://localhost:3000${WEBHOOK_URL}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-paystack-signature": sign(rawBody) },
      body: rawBody,
    });
    const res = await POST(request);
    expect(res.status).toBe(200);
    await expect(json(res)).resolves.toEqual({ received: true });
    expect(connectToDatabaseMock).not.toHaveBeenCalled();
  });

  it("200 + received for unrelated events without touching the database", async () => {
    const res = await POST(signedRequest({ event: "charge.hold", data: { reference: REFERENCE } }));
    expect(res.status).toBe(200);
    await expect(json(res)).resolves.toEqual({ received: true });
    expect(connectToDatabaseMock).not.toHaveBeenCalled();
    expect(paymentStub.findOne).not.toHaveBeenCalled();
  });

  it("200 for an unknown reference without mutating anything", async () => {
    paymentStub.findOne.mockReturnValue(buildQuery(null));
    const res = await POST(signedRequest(chargeSuccess()));
    expect(res.status).toBe(200);
    await expect(json(res)).resolves.toEqual({ received: true });
    expect(connectToDatabaseMock).toHaveBeenCalledTimes(1);
    expect(invoiceStub.findById).not.toHaveBeenCalled();
  });

  it("settles a charge.success and acks", async () => {
    paymentStub.findOne.mockReturnValue(buildQuery(paymentDoc()));
    invoiceStub.findById.mockReturnValue(buildQuery(pendingInvoice()));
    invoiceStub.findOneAndUpdate.mockReturnValue(buildQuery(paidInvoice()));
    paymentStub.updateOne.mockResolvedValue(undefined);

    const res = await POST(signedRequest(chargeSuccess()));

    expect(res.status).toBe(200);
    await expect(json(res)).resolves.toEqual({ received: true });

    const [filter, updateData] = invoiceStub.findOneAndUpdate.mock.calls[0] as [
      Record<string, unknown>,
      { $set: Record<string, unknown> },
    ];
    const set = updateData.$set;
    expect(filter).toEqual({ _id: INVOICE_ID, status: { $in: ["pending", "draft"] } });
    expect(set.status).toBe("paid");
    expect(set.amountPaid).toBe(25000);
    expect(set.method).toBe("Card");
    expect(notifyInvoicePaidMock).toHaveBeenCalledTimes(1);
  });

  it("acks a voided invoice without settling", async () => {
    paymentStub.findOne.mockReturnValue(buildQuery(paymentDoc()));
    invoiceStub.findById.mockReturnValue(
      buildQuery(makeInvoice({ _id: INVOICE_ID, tenantId: TENANT_A, status: "void" })),
    );
    const res = await POST(signedRequest(chargeSuccess()));
    expect(res.status).toBe(200);
    expect(invoiceStub.findOneAndUpdate).not.toHaveBeenCalled();
    expect(notifyInvoicePaidMock).not.toHaveBeenCalled();
  });

  it("delivering the same charge.success twice settles exactly once", async () => {
    paymentStub.findOne.mockReturnValue(buildQuery(paymentDoc()));
    // First delivery finds the pending invoice and settles it; the replay then
    // sees the paid invoice and takes the catch-up path.
    invoiceStub.findById
      .mockReturnValueOnce(buildQuery(pendingInvoice()))
      .mockReturnValueOnce(buildQuery(paidInvoice()));
    invoiceStub.findOneAndUpdate.mockReturnValue(buildQuery(paidInvoice()));
    paymentStub.updateOne.mockResolvedValue(undefined);

    const first = await POST(signedRequest(chargeSuccess()));
    const second = await POST(signedRequest(chargeSuccess()));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(invoiceStub.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(paymentStub.updateOne).toHaveBeenCalledTimes(2);
    expect(notifyInvoicePaidMock).toHaveBeenCalledTimes(1);
  });
});
