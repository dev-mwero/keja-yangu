import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { parseStkCallback, verifyMpesaCallbackToken } from "@/lib/payments/mpesa";
import { applyProviderPayment } from "@/lib/payments/settle";
import { mpesaCallbackParams } from "@/lib/schemas";
import { Payment } from "@/models/Payment";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 1_000_000;

/**
 * Daraja result callback for an owner's STK push.
 *
 * Daraja does not sign payloads and retries every non-2xx, so the route's
 * contract is: authenticate with the HMAC token baked into the callback URL,
 * then always answer 200 (even for an unknown CheckoutRequestID) so a retry
 * storm can never result from our side. Settlement is idempotent via
 * `applyProviderPayment`; a forged token is the only outright rejection.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ ownerId: string; token: string }> },
) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const params = await context.params;
  const parsedParams = mpesaCallbackParams.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid callback path" }, { status: 400 });
  }

  const { ownerId, token } = parsedParams.data;
  if (!verifyMpesaCallbackToken(ownerId, token)) {
    return NextResponse.json({ error: "Invalid callback token" }, { status: 401 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.warn("[payments] mpesa callback unparseable body");
    return NextResponse.json({ received: true });
  }

  const callback = parseStkCallback(payload);
  if (!callback) {
    console.warn("[payments] mpesa callback unrecognised payload");
    return NextResponse.json({ received: true });
  }

  await connectToDatabase();

  const payment = await Payment.findOne({
    provider: "mpesa",
    providerReference: callback.checkoutRequestId,
    ownerId,
  }).lean();
  if (!payment) {
    console.warn(`[payments] mpesa callback unknown checkout=${callback.checkoutRequestId}`);
    return NextResponse.json({ received: true });
  }

  if (payment.status === "success") {
    return NextResponse.json({ received: true });
  }

  if (callback.resultCode !== 0) {
    await Payment.updateOne(
      { _id: payment._id },
      {
        $set: { status: "failed", lastEvent: "stk_failed" },
        $push: {
          notes: `M-Pesa declined: ${callback.resultDesc || "unknown"} (code ${callback.resultCode})`,
        },
      },
    ).catch((error) => console.warn("[payments] mpesa decline update failed", error));
    console.info(
      `[payments] mpesa failed checkout=${callback.checkoutRequestId} code=${callback.resultCode}`,
    );
    return NextResponse.json({ received: true });
  }

  const result = await applyProviderPayment({
    provider: "mpesa",
    providerReference: callback.checkoutRequestId,
    amountMinor: callback.amountMinor ?? 0,
    currency: "KES",
    channel: "mpesa",
    paidAt: callback.paidAt,
    source: "webhook",
  });

  if (callback.receipt) {
    await Payment.updateOne(
      { _id: payment._id },
      { $set: { channel: "mpesa" }, $push: { notes: `M-Pesa receipt ${callback.receipt}` } },
    ).catch(() => undefined);
  }

  console.info(
    `[payments] mpesa callback checkout=${callback.checkoutRequestId} result=${result.outcome}`,
  );

  return NextResponse.json({ received: true });
}
