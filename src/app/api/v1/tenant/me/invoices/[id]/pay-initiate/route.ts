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
import { createCheckout, getPaystackSecret } from "@/lib/payments/paystack";
import {
  buildPaymentReference,
  type CreateCheckoutResult,
  PAYMENT_HOLD_MINUTES,
  toMinorUnits,
} from "@/lib/payments/provider";
import { authenticate, requirePermission } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { paystackInitiateInput } from "@/lib/schemas";
import { Invoice } from "@/models/Invoice";
import { Payment } from "@/models/Payment";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  // Bucket the limiter by the authenticated user (5/min) rather than by IP so
  // a tenant's checkout attempts are throttled consistently across devices.
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

  try {
    getPaystackSecret();
  } catch {
    return NextResponse.json({ error: "Online payments are not configured" }, { status: 503 });
  }

  const body = await readJsonBody(request);
  const parsed = paystackInitiateInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payment payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const now = new Date();
  const amountMinor = toMinorUnits(invoice.amountDue - invoice.amountPaid);

  // The Payment row is the claim on the reference: create it before talking to
  // Paystack so a crash mid-checkout is still discoverable and idempotent. The
  // pending-per-invoice partial unique index makes concurrent initiates race,
  // so the loser re-reads the winner's pending row and returns its checkout
  // window; if that row was abandoned between the read and the insert (lazy
  // TTL sweep), one bounded retry re-runs the whole init sequence.
  let payment: { _id: unknown; providerReference: string } | null = null;
  let reference = "";
  let expiresAt: Date = now;
  for (let attempt = 0; attempt < 2 && payment === null; attempt += 1) {
    // Reuse a live pending checkout window instead of stacking a second one.
    const existing = await Payment.findOne({
      provider: "paystack",
      invoiceId: id,
      status: "pending",
      expiresAt: { $gt: now },
    }).lean();
    if (existing) {
      return NextResponse.json({
        data: {
          paymentId: String(existing._id),
          reference: existing.providerReference,
          authorizationUrl: existing.authorizationUrl ?? "",
          expiresAt: existing.expiresAt,
        },
      });
    }

    // Any pending windows that lapsed become "abandoned" history.
    await Payment.updateMany(
      { invoiceId: id, status: "pending", expiresAt: { $lte: now } },
      { $set: { status: "abandoned" } },
    );

    reference = buildPaymentReference(id);
    expiresAt = new Date(now.getTime() + PAYMENT_HOLD_MINUTES * 60_000);

    try {
      payment = await Payment.create({
        provider: "paystack",
        providerReference: reference,
        invoiceId: id,
        tenantId: invoice.tenantId,
        ownerId: invoice.ownerId,
        propertyId: invoice.propertyId,
        amountMinor,
        currency: "KES",
        status: "pending",
        initiatedAt: now,
        expiresAt,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;

      // Same reference collided on the {provider, providerReference} index —
      // the identical checkout already exists; hand it back.
      const withReference = await Payment.findOne({
        provider: "paystack",
        providerReference: reference,
      }).lean();
      if (withReference) {
        return NextResponse.json({
          data: {
            paymentId: String(withReference._id),
            reference: withReference.providerReference,
            authorizationUrl: withReference.authorizationUrl ?? "",
            expiresAt: withReference.expiresAt,
          },
        });
      }

      // Another concurrent initiate won the pending-per-invoice race; return
      // its live checkout window instead of 409ing a legitimate caller.
      const survivor = await Payment.findOne({ invoiceId: id, status: "pending" }).lean();
      if (survivor) {
        return NextResponse.json({
          data: {
            paymentId: String(survivor._id),
            reference: survivor.providerReference,
            authorizationUrl: survivor.authorizationUrl ?? "",
            expiresAt: survivor.expiresAt,
          },
        });
      }

      // The winner's row was abandoned between our read and insert — retry once.
    }
  }

  if (!payment) {
    // Both attempts collided and no pending row survived; do not mint another.
    return NextResponse.json({ error: "Could not create payment" }, { status: 409 });
  }

  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard/tenant/payments`;
  const email = auth?.email || `tenant-${userId}@keja.local`;

  let checkout: CreateCheckoutResult;
  try {
    checkout = await createCheckout({ email, invoiceId: id, amountMinor, reference, callbackUrl });
  } catch {
    await Payment.updateOne(
      { _id: payment._id },
      { $set: { status: "failed", lastEvent: "initialize_error" } },
    ).catch(() => undefined);
    return NextResponse.json({ error: "Payment provider error" }, { status: 502 });
  }

  await Payment.updateOne(
    { _id: payment._id },
    { $set: { authorizationUrl: checkout.authorizationUrl, lastEvent: "initialized" } },
  );

  console.info(
    `[payments] initiate invoice=${id} reference=${reference} amountMinor=${amountMinor}`,
  );

  return NextResponse.json({
    data: {
      paymentId: String(payment._id),
      reference,
      authorizationUrl: checkout.authorizationUrl,
      expiresAt,
    },
  });
}
