import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveTenantActor, resolveTenantIds } from "@/app/api/v1/_helpers";
import { serializeInvoice } from "@/lib/invoicing";
import { connectToDatabase } from "@/lib/mongoose";
import { queryStkStatus } from "@/lib/payments/mpesa";
import { getOwnerPaymentConfig, resolveDarajaConfig } from "@/lib/payments/owner-config";
import { verify } from "@/lib/payments/paystack";
import { applyProviderPayment } from "@/lib/payments/settle";
import { authenticate, requirePermission } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { paymentStatusQuery } from "@/lib/schemas";
import { Invoice } from "@/models/Invoice";
import { Payment, serializePayment } from "@/models/Payment";

// Server-side verify fallback for tenants who return from a payment callback
// without the provider's webhook landing (or a lost webhook in general). Only
// the initiate-created payment reference is trusted; the payment must belong to
// the caller's tenants or its existence is not leaked. Dispatches on the stored
// provider: Paystack re-verifies over HTTP, M-Pesa queries the STK status.

async function recheckPendingPayment(payment: {
  provider: string;
  providerReference: string;
  ownerId: string;
  amountMinor: number;
}): Promise<void> {
  const reference = payment.providerReference;

  if (payment.provider === "mpesa") {
    const config = resolveDarajaConfig(await getOwnerPaymentConfig(payment.ownerId));
    if (!config) return;
    // The STK query carries no amount, so an accepted push settles for the
    // stored server-derived balance (never a client value).
    try {
      const result = await queryStkStatus(config, reference);
      if (result.resultCode === 0) {
        await applyProviderPayment({
          provider: "mpesa",
          providerReference: reference,
          amountMinor: payment.amountMinor,
          currency: "KES",
          channel: "mpesa",
          paidAt: new Date(),
          source: "verify",
        });
      } else {
        await Payment.updateOne(
          { provider: "mpesa", providerReference: reference },
          {
            $set: { status: "failed", lastEvent: "stk_failed" },
            $push: { notes: `M-Pesa declined: ${result.resultDesc || "unknown"}` },
          },
        ).catch(() => undefined);
      }
    } catch (error) {
      // Daraja unreachable, or the prompt is still pending (HTTP 500 with
      // errorCode 500.001.1001) — report the current state either way.
      console.warn(`[payments] mpesa verify fallback failed reference=${reference}`, error);
    }
    return;
  }

  try {
    const verified = await verify(reference);
    await applyProviderPayment({
      provider: "paystack",
      providerReference: reference,
      amountMinor: verified.amountMinor,
      currency: verified.currency,
      channel: verified.channel,
      paidAt: verified.paidAt,
      source: "verify",
    });
  } catch (error) {
    console.warn(`[payments] verify fallback failed reference=${reference}`, error);
  }
}

export async function GET(request: NextRequest) {
  // GET performs a state-changing provider verify + settlement, so it is
  // throttled per authenticated user like pay-initiate (the key prevents IP
  // rotation from evading the bucket).
  const auth = authenticate(request);
  const limit = await rateLimit(request, {
    windowMs: 60_000,
    limit: 30,
    key: auth ? `user:${auth.userId}` : undefined,
  });
  if (limit instanceof NextResponse) return limit;

  const authError = await requirePermission(request, "invoice:read-own");
  if (authError) return authError;

  const userId = await resolveTenantActor(request);
  if (userId instanceof NextResponse) return userId;

  const parsed = paymentStatusQuery.safeParse({
    reference: request.nextUrl.searchParams.get("reference"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
  }
  const reference = parsed.data.reference;

  await connectToDatabase();

  const tenantIds = await resolveTenantIds(userId);
  // References are namespaced by shape (Paystack `KY-...` vs Daraja checkout
  // ids), so the reference alone resolves the row; ownership is checked next.
  const payment = await Payment.findOne({ providerReference: reference }).lean();
  if (!payment || !tenantIds.includes(payment.tenantId)) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  if (payment.status === "pending") {
    await recheckPendingPayment(payment);
  }

  const refreshed = await Payment.findById(payment._id).lean();
  const invoice = await Invoice.findById(payment.invoiceId).lean();
  const ownerInvoice = invoice?.tenantId && tenantIds.includes(invoice.tenantId) ? invoice : null;

  return NextResponse.json({
    data: {
      payment: serializePayment(refreshed ?? payment),
      ...(ownerInvoice ? { invoice: serializeInvoice(ownerInvoice, new Date()) } : {}),
    },
  });
}
