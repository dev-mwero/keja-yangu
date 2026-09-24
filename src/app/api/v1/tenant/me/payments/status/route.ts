import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveTenantActor, resolveTenantIds } from "@/app/api/v1/_helpers";
import { serializeInvoice } from "@/lib/invoicing";
import { connectToDatabase } from "@/lib/mongoose";
import { verify } from "@/lib/payments/paystack";
import { applyProviderPayment } from "@/lib/payments/settle";
import { authenticate, requirePermission } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { paystackStatusQuery } from "@/lib/schemas";
import { Invoice } from "@/models/Invoice";
import { Payment, serializePayment } from "@/models/Payment";

// Server-side verify fallback for tenants who return from the Paystack
// callback without a webhook landing (or a lost webhook in general). Only the
// initiate-created payment reference is trusted; the payment must belong to
// the caller's tenants or its existence is not leaked.

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

  const parsed = paystackStatusQuery.safeParse({
    reference: request.nextUrl.searchParams.get("reference"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
  }
  const reference = parsed.data.reference;

  await connectToDatabase();

  const tenantIds = await resolveTenantIds(userId);
  const payment = await Payment.findOne({
    provider: "paystack",
    providerReference: reference,
  }).lean();
  if (!payment || !tenantIds.includes(payment.tenantId)) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  if (payment.status === "pending") {
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
      // Paystack unreachable or verify misbehaving — report the current state
      // rather than failing the fallback check.
      console.warn(`[payments] verify fallback failed reference=${reference}`, error);
    }
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
