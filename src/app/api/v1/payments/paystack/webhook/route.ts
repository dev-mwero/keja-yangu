import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { getPaystackSecret, verifyPaystackSignature } from "@/lib/payments/paystack";
import { applyProviderPayment } from "@/lib/payments/settle";
import { paystackWebhookEnvelope } from "@/lib/schemas";

export const runtime = "nodejs";

// The Paystack HMAC-SHA512 signature is the single trust gate for this route.
// A browser cookie is never present on Paystack's servers, so cookie auth and
// checkSameOrigin are deliberately excluded — authenticating the signature
// proves the payload came from the configured merchant secret. An IP-based
// rate limiter is also excluded here: Paystack's sender IPs are documented as
// changeable, and a spoofable IP limiter would be an easy DoS vector. The 1MB
// body cap, constant-time signature check and unique reference index are the
// protection instead.

export async function POST(request: NextRequest) {
  // Cheap pre-buffer guards: reject an oversized declared body and a missing
  // signature before `request.text()` buffers anything into memory.
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > 1_000_000) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const signature = request.headers.get("x-paystack-signature");
  if (!signature || signature.length === 0) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // A missing or legacy Paystack secret is a server config fault, not a client
  // signature failure — surface it as 500 so it is distinguishable on callbacks.
  try {
    getPaystackSecret();
  } catch {
    return NextResponse.json({ error: "Online payments are not configured" }, { status: 500 });
  }

  // NEVER readJsonBody here: it swallows parse errors and would verify the
  // wrong bytes. The signature must cover the exact raw body.
  const rawBody = await request.text();

  if (Buffer.byteLength(rawBody, "utf8") > 1_000_000) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  if (!verifyPaystackSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // A valid signature over unparseable bytes is a sender-side defect: ack
    // and warn (a retry storm cannot fix a malformed body, so never 4xx here).
    console.warn("[payments] webhook valid signature but unparseable body");
    return NextResponse.json({ received: true });
  }

  const parsed = paystackWebhookEnvelope.safeParse(payload);
  if (!parsed.success) {
    // Well-formed JSON that does not match the envelope is a genuine
    // integration bug worth surfacing to Paystack's retry queue.
    console.warn("[payments] webhook envelope rejected", parsed.error.flatten());
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { event, data } = parsed.data;
  // Acknowledge every other event (charge.hold, transfer.*, ...) without
  // touching the database.
  if (event !== "charge.success" || data.status !== "success") {
    return NextResponse.json({ received: true });
  }

  await connectToDatabase();

  const result = await applyProviderPayment({
    provider: "paystack",
    providerReference: data.reference,
    amountMinor: data.amount ?? 0,
    currency: data.currency ?? "KES",
    channel: data.channel,
    paidAt: data.paid_at ?? undefined,
    source: "webhook",
  });

  console.info(
    `[payments] event=${event} reference=${data.reference} result=${result.outcome} amountKobo=${data.amount ?? 0}`,
  );

  return NextResponse.json({ received: true });
}
