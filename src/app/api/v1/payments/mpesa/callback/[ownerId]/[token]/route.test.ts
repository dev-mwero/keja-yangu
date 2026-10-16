/** @vitest-environment node */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeObjectId, makePayment } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/Payment", () => ({ Payment: getModelStubs().payment }));
vi.mock("@/lib/payments/settle", () => ({ applyProviderPayment: vi.fn() }));

import { POST } from "@/app/api/v1/payments/mpesa/callback/[ownerId]/[token]/route";
import { buildMpesaCallbackToken } from "@/lib/payments/mpesa";
import { applyProviderPayment } from "@/lib/payments/settle";

const { payment: paymentStub } = getModelStubs();
const applyProviderPaymentMock = vi.mocked(applyProviderPayment);

const OWNER_ID = makeObjectId("callback-owner");
const CHECKOUT_ID = "ws_CO_20092026120000123";
const SECRET = "callback-test-secret";

function successPayload() {
  return {
    Body: {
      stkCallback: {
        MerchantRequestID: "merchant-1",
        CheckoutRequestID: CHECKOUT_ID,
        ResultCode: 0,
        ResultDesc: "The service request is processed successfully.",
        CallbackMetadata: {
          Item: [
            { Name: "Amount", Value: 25000 },
            { Name: "MpesaReceiptNumber", Value: "QK12ABC3XY" },
            { Name: "TransactionDate", Value: 20260920120000 },
            { Name: "PhoneNumber", Value: 254712345678 },
          ],
        },
      },
    },
  };
}

function failurePayload() {
  return {
    Body: {
      stkCallback: {
        CheckoutRequestID: CHECKOUT_ID,
        ResultCode: 1032,
        ResultDesc: "Request cancelled by user",
      },
    },
  };
}

function context(ownerId = OWNER_ID, token = buildMpesaCallbackToken(OWNER_ID)) {
  return { params: Promise.resolve({ ownerId, token }) };
}

function callbackRequest(body: unknown = successPayload()) {
  return new NextRequest("http://localhost:3000/api/v1/payments/mpesa/callback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function pendingPayment() {
  return makePayment({
    provider: "mpesa",
    providerReference: CHECKOUT_ID,
    ownerId: OWNER_ID,
    amountMinor: 2500000,
    status: "pending",
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("POST /api/v1/payments/mpesa/callback/[ownerId]/[token]", () => {
  beforeEach(() => {
    resetModelStubs();
    process.env.MPESA_CALLBACK_SECRET = SECRET;
    applyProviderPaymentMock.mockReset();
    applyProviderPaymentMock.mockResolvedValue({ outcome: "settled" });
  });
  afterEach(() => {
    delete process.env.MPESA_CALLBACK_SECRET;
  });

  it("400 for a malformed callback path", async () => {
    const res = await POST(
      callbackRequest(),
      context("not-a-hex-owner", buildMpesaCallbackToken(OWNER_ID)),
    );
    expect(res.status).toBe(400);
  });

  it("401 for a forged token", async () => {
    const res = await POST(callbackRequest(), context(OWNER_ID, "0".repeat(64)));
    expect(res.status).toBe(401);
    await expect(json(res)).resolves.toEqual({ error: "Invalid callback token" });
    expect(applyProviderPaymentMock).not.toHaveBeenCalled();
  });

  it("200 acks an unparseable body", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/payments/mpesa/callback", {
      method: "POST",
      body: "{not json",
    });
    const res = await POST(req, context());
    expect(res.status).toBe(200);
    await expect(json(res)).resolves.toEqual({ received: true });
    expect(paymentStub.findOne).not.toHaveBeenCalled();
  });

  it("200 acks an unrecognised payload shape", async () => {
    const res = await POST(callbackRequest({ hello: "world" }), context());
    expect(res.status).toBe(200);
    await expect(json(res)).resolves.toEqual({ received: true });
    expect(paymentStub.findOne).not.toHaveBeenCalled();
  });

  it("200 acks a callback for an unknown CheckoutRequestID", async () => {
    paymentStub.findOne.mockReturnValue(buildQuery(null));
    const res = await POST(callbackRequest(), context());
    expect(res.status).toBe(200);
    await expect(json(res)).resolves.toEqual({ received: true });
    expect(applyProviderPaymentMock).not.toHaveBeenCalled();
  });

  it("200 settles the invoice on a successful callback and records the receipt", async () => {
    paymentStub.findOne.mockReturnValue(buildQuery(pendingPayment()));
    paymentStub.updateOne.mockResolvedValue(undefined);

    const res = await POST(callbackRequest(), context());

    expect(res.status).toBe(200);
    await expect(json(res)).resolves.toEqual({ received: true });
    expect(applyProviderPaymentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "mpesa",
        providerReference: CHECKOUT_ID,
        amountMinor: 2500000,
        currency: "KES",
        channel: "mpesa",
        source: "webhook",
      }),
    );
    expect(paymentStub.updateOne).toHaveBeenCalledWith(
      { _id: expect.anything() },
      expect.objectContaining({
        $push: { notes: "M-Pesa receipt QK12ABC3XY" },
      }),
    );
  });

  it("200 marks a declined callback failed without settling", async () => {
    paymentStub.findOne.mockReturnValue(buildQuery(pendingPayment()));
    paymentStub.updateOne.mockResolvedValue(undefined);

    const res = await POST(callbackRequest(failurePayload()), context());

    expect(res.status).toBe(200);
    expect(applyProviderPaymentMock).not.toHaveBeenCalled();
    expect(paymentStub.updateOne).toHaveBeenCalledWith(
      { _id: expect.anything() },
      expect.objectContaining({
        $set: { status: "failed", lastEvent: "stk_failed" },
      }),
    );
  });

  it("200 is idempotent for an already-settled payment", async () => {
    paymentStub.findOne.mockReturnValue(buildQuery({ ...pendingPayment(), status: "success" }));
    const res = await POST(callbackRequest(), context());
    expect(res.status).toBe(200);
    expect(applyProviderPaymentMock).not.toHaveBeenCalled();
    expect(paymentStub.updateOne).not.toHaveBeenCalled();
  });
});
