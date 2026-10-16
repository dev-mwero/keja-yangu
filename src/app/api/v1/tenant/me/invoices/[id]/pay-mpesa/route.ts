import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  isDuplicateKeyError,
  readJsonBody,
  resolveTenantActor,
  resolveTenantIds,
} from "@/app/api/v1/_helpers";
import { canPayOnline } from "@/lib/invoicing";
import { connectToDatabase } from "@/lib/mongoose";
import {
  buildMpesaCallbackToken,
  initiateStkPush,
  MpesaProviderError,
  type StkPushResult,
} from "@/lib/payments/mpesa";
import { getOwnerPaymentConfig, resolveDarajaConfig } from "@/lib/payments/owner-config";
import { PAYMENT_HOLD_MINUTES, toMinorUnits } from "@/lib/payments/provider";
import { authenticate, requirePermission } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { mpesaInitiateInput } from "@/lib/schemas";
import { Invoice } from "@/models/Invoice";
import { Payment } from "@/models/Payment";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function pendingResponse(payment: { _id: unknown; providerReference: string; expiresAt: Date }) {
  return NextResponse.json({
    data: {
      paymentId: String(payment._id),
      reference: payment.providerReference,
      expiresAt: payment.expiresAt,
      status: "pending",
    },
  });
}

/**
 * Initiates an owner-collected M-Pesa STK push for a tenant's invoice.
 *
 * Unlike Paystack (hosted checkout, client-supplied reference), Daraja does not
 * accept a caller reference — the `CheckoutRequestID` is only known after the
 * prompt is sent. So this route is STK-first: it prompts the phone, then
 * persists the `Payment` row keyed by that CheckoutRequestID. The
 * pending-per-invoice unique index still guarantees at most one live attempt;
 * the small window between the push and the insert is guarded by the reuse
 * pre-check and the per-user rate limit.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = authenticate(request);
  const limit = await rateLimit(request, {
    windowMs: 60_000,
    limit: 5,
    key: auth ? `user:${auth.userId}` : undefined,
  });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid invoice id" }, { status: 400 });
  }

  const authError = await requirePermission(request, "invoice:read-own");
  if (authError) return authError;

  const userId = await resolveTenantActor(request);
  if (userId instanceof NextResponse) return userId;

  await connectToDatabase();

  const tenantIds = await resolveTenantIds(userId);
  const invoice = await Invoice.findOne({ _id: id, tenantId: { $in: tenantIds } }).lean();
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  if (!canPayOnline(invoice)) {
    const message =
      invoice.status === "paid"
        ? "Invoice is already paid"
        : invoice.status === "void"
          ? "Invoice is void"
          : invoice.status === "draft"
            ? "Draft invoices cannot be paid online"
            : "Invoice is not payable online";
    return NextResponse.json({ error: message }, { status: 409 });
  }

  const config = resolveDarajaConfig(await getOwnerPaymentConfig(invoice.ownerId));
  if (!config) {
    return NextResponse.json(
      { error: "M-Pesa is not configured for this property owner" },
      { status: 503 },
    );
  }

  const body = await readJsonBody(request);
  const parsed = mpesaInitiateInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payment payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const now = new Date();

  // Reuse a live attempt: an M-Pesa prompt is already out, so return its
  // reference for polling. A live attempt under a different provider means the
  // tenant is mid-checkout elsewhere; never stack a second one.
  const existing = await Payment.findOne({
    invoiceId: id,
    status: "pending",
    expiresAt: { $gt: now },
  }).lean();
  if (existing) {
    if (existing.provider === "mpesa") return pendingResponse(existing);
    return NextResponse.json(
      { error: "Another payment is already in progress for this invoice" },
      { status: 409 },
    );
  }

  // Lapsed pending windows become "abandoned" history.
  await Payment.updateMany(
    { invoiceId: id, status: "pending", expiresAt: { $lte: now } },
    { $set: { status: "abandoned" } },
  );

  const amountMinor = toMinorUnits(invoice.amountDue - invoice.amountPaid);
  const token = buildMpesaCallbackToken(invoice.ownerId);
  const callbackUrl = `${appUrl()}/api/v1/payments/mpesa/callback/${invoice.ownerId}/${token}`;

  let stk: StkPushResult;
  try {
    stk = await initiateStkPush(config, {
      phone: parsed.data.phone,
      amountMinor,
      accountReference: invoice.invoiceNumber,
      transactionDesc: `Rent ${invoice.period}`,
      callbackUrl,
    });
  } catch (error) {
    if (error instanceof MpesaProviderError) {
      console.warn(`[payments] mpesa initiate failed invoice=${id} reason=${error.message}`);
    }
    return NextResponse.json({ error: "Payment provider error" }, { status: 502 });
  }

  const expiresAt = new Date(now.getTime() + PAYMENT_HOLD_MINUTES * 60_000);
  let payment: { _id: unknown; providerReference: string; expiresAt: Date } | null = null;
  try {
    payment = await Payment.create({
      provider: "mpesa",
      providerReference: stk.checkoutRequestId,
      invoiceId: id,
      tenantId: invoice.tenantId,
      ownerId: invoice.ownerId,
      propertyId: invoice.propertyId,
      amountMinor,
      currency: "KES",
      status: "pending",
      channel: "mpesa",
      initiatedAt: now,
      expiresAt,
      lastEvent: "stk_sent",
      rawEvent: { merchantRequestId: stk.merchantRequestId },
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;

    // A concurrent initiate won the pending-per-invoice race, or this STK is a
    // replay of an identical CheckoutRequestID. Return the surviving row.
    const survivor = await Payment.findOne({ invoiceId: id, status: "pending" }).lean();
    if (survivor) return pendingResponse(survivor);
    const withReference = await Payment.findOne({
      provider: "mpesa",
      providerReference: stk.checkoutRequestId,
    }).lean();
    if (withReference) return pendingResponse(withReference);
    return NextResponse.json({ error: "Could not record payment" }, { status: 409 });
  }

  if (!payment) {
    return NextResponse.json({ error: "Could not record payment" }, { status: 409 });
  }

  console.info(
    `[payments] mpesa initiate invoice=${id} checkout=${stk.checkoutRequestId} amountMinor=${amountMinor}`,
  );

  return NextResponse.json({
    data: {
      paymentId: String(payment._id),
      reference: payment.providerReference,
      expiresAt,
      status: "pending",
      customerMessage: stk.customerMessage,
    },
  });
}
