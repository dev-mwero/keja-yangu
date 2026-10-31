import { notifyInvoicePaid } from "@/lib/notifications";
import { computeInvoicePaymentSplit, computePaymentSplit } from "@/lib/payment-split";
import type { PaymentProviderName } from "@/lib/payments/provider";
import { mapChannelToMethod, PROVIDER_LABELS, toMinorUnits } from "@/lib/payments/provider";
import { Invoice } from "@/models/Invoice";
import { Lease } from "@/models/Lease";
import { Payment } from "@/models/Payment";
import { PaymentSplit } from "@/models/PaymentSplit";
import { Unit } from "@/models/Unit";

export type PaymentSettlementSource = "webhook" | "verify";

export interface ApplyProviderPaymentInput {
  provider: PaymentProviderName;
  providerReference: string;
  amountMinor: number;
  currency: string;
  channel?: string;
  paidAt?: Date | string | null;
  source: PaymentSettlementSource;
}

export type ApplyProviderPaymentOutcome =
  | "settled"
  | "already-settled"
  | "amount-mismatch"
  | "invoice-voided"
  | "invoice-missing"
  | "unknown-reference";

interface PaymentLike {
  _id: unknown;
  paidAt?: Date;
  notes?: string[];
}

interface InvoiceLike {
  _id: unknown;
  status: string;
  amountDue: number;
  amountPaid: number;
  tenantId: string;
  leaseId: string;
  propertyId: string;
  ownerId: string;
  period: string;
  rentAmount?: number;
  serviceChargeAmount?: number;
  rentIncludesServiceCharge?: boolean;
  notes?: string;
}

function safePaidAt(paidAt: Date | string | null | undefined, fallback: Date): Date {
  if (!paidAt) return fallback;
  const parsed = new Date(paidAt);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

/**
 * Flips the Payment ledger row to success. Best-effort: a failure here must
 * never fail the webhook response (Paystack retries non-2xx responses and the
 * payment is already recorded on the invoice).
 */
async function flipPaymentToSuccess(
  payment: PaymentLike,
  paidAt: Date,
  source: PaymentSettlementSource,
): Promise<void> {
  try {
    await Payment.updateOne(
      { _id: payment._id },
      { $set: { status: "success", paidAt: payment.paidAt ?? paidAt, lastEvent: source } },
    );
  } catch (error) {
    console.warn(`[payments] ledger flip failed reference=${String(payment._id)}`, error);
  }
}

async function recordMismatch(
  payment: PaymentLike,
  invoice: InvoiceLike,
  expectedMinor: number,
  input: ApplyProviderPaymentInput,
  paidAt: Date,
): Promise<void> {
  const note = `Amount mismatch: provider sent ${input.amountMinor} minor units, invoice requires ${expectedMinor}`;
  try {
    await Payment.updateOne(
      { _id: payment._id },
      {
        $set: { status: "success", paidAt: payment.paidAt ?? paidAt, lastEvent: input.source },
        $push: { notes: note },
      },
    );
  } catch (error) {
    console.warn(
      `[payments] mismatch ledger update failed reference=${String(payment._id)}`,
      error,
    );
  }
  try {
    await Invoice.updateOne(
      { _id: invoice._id },
      { $set: { notes: invoice.notes ? `${invoice.notes}\n${note}` : note } },
    );
  } catch (error) {
    console.warn(`[payments] mismatch invoice update failed invoice=${String(invoice._id)}`, error);
  }
}

/**
 * Best-effort record of how a settled payment divides between rent (→ owner)
 * and service charge (→ caretaker). Never throws: a failure here must not
 * block or overturn a successful settlement.
 */
async function recordPaymentSplit(
  payment: PaymentLike,
  invoice: InvoiceLike,
  amountMinor: number,
): Promise<void> {
  try {
    if (!invoice.leaseId) return; // manual invoices have no unit → no split
    const lease = await Lease.findById(invoice.leaseId).select("unitId").lean();
    if (!lease?.unitId) return;

    // Modern invoices carry an immutable rent/service-fee snapshot. Fall back
    // to the unit's legacy inclusive percentages only for older documents.
    let split;
    if (
      typeof invoice.rentAmount === "number" &&
      typeof invoice.serviceChargeAmount === "number"
    ) {
      split = computeInvoicePaymentSplit(invoice, amountMinor);
    } else {
      const unit = await Unit.findById(lease.unitId).lean();
      if (!unit) return;
      split = computePaymentSplit(
        {
          rentIncludesServiceCharge: !!unit.rentIncludesServiceCharge,
          rentSharePercent: unit.rentSharePercent ?? 0,
          serviceChargeSharePercent: unit.serviceChargeSharePercent ?? 0,
        },
        amountMinor,
      );
    }

    await PaymentSplit.create({
      paymentId: String(payment._id),
      invoiceId: String(invoice._id),
      unitId: String(lease.unitId),
      propertyId: invoice.propertyId,
      ownerId: invoice.ownerId,
      period: invoice.period,
      rentMinor: split.rentMinor,
      serviceChargeMinor: split.serviceChargeMinor,
    });
  } catch (error) {
    console.warn(
      `[payments] payment-split record failed payment=${String(payment._id)} invoice=${String(invoice._id)}`,
      error,
    );
  }
}

/**
 * The single settlement setter shared by the webhook and the verify fallback.
 *
 * The initiation-created `Payment` row (keyed by `{provider, providerReference}`)
 * is the only trusted reference→invoice map, and the invoice flip is a
 * conditional `findOneAndUpdate` so a concurrent staff mark-paid / webhook
 * delivery can never overwrite each other — whichever writer wins, the other
 * observes a non-matching document and reports `already-settled`.
 *
 * Never throws for provider/ledger inconsistencies: every outcome except a
 * genuine database failure is classified and returned so the webhook can ack.
 */
export async function applyProviderPayment(
  input: ApplyProviderPaymentInput,
): Promise<{ outcome: ApplyProviderPaymentOutcome }> {
  const payment = await Payment.findOne({
    provider: input.provider,
    providerReference: input.providerReference,
  }).lean();
  if (!payment) {
    return { outcome: "unknown-reference" };
  }

  const invoice = await Invoice.findById(payment.invoiceId).lean();
  if (!invoice) {
    return { outcome: "invoice-missing" };
  }

  const now = new Date();
  const paidAt = safePaidAt(input.paidAt, now);

  // Replay fast-path: the invoice was already settled (by us or a concurrent
  // writer); catch the ledger row up to success without re-notifying.
  if (invoice.status === "paid") {
    await flipPaymentToSuccess(payment, paidAt, input.source);
    return { outcome: "already-settled" };
  }

  if (invoice.status === "void") {
    return { outcome: "invoice-voided" };
  }

  const expectedMinor = toMinorUnits(invoice.amountDue - invoice.amountPaid);
  if (input.amountMinor !== expectedMinor) {
    // Never auto-settle a wrong amount; record it for staff review and leave
    // the invoice pending.
    await recordMismatch(payment, invoice, expectedMinor, input, paidAt);
    return { outcome: "amount-mismatch" };
  }

  const updated = await Invoice.findOneAndUpdate(
    { _id: invoice._id, status: { $in: ["pending", "draft"] } },
    {
      $set: {
        status: "paid",
        amountPaid: invoice.amountDue,
        paidAt,
        method: mapChannelToMethod(input.channel),
        notes: invoice.notes
          ? `${invoice.notes}\nPaid via ${PROVIDER_LABELS[input.provider]} (${input.providerReference})`
          : `Paid via ${PROVIDER_LABELS[input.provider]} (${input.providerReference})`,
        paidBy: invoice.tenantId,
        paidByRole: "tenant",
      },
    },
    { new: true, runValidators: true },
  ).lean();

  if (!updated) {
    // A concurrent writer settled or voided the invoice between our read and
    // the conditional update. If it is now void, do not touch the ledger row;
    // otherwise mirror success as a catch-up and classify as already-settled.
    const current = await Invoice.findById(invoice._id).lean();
    if (!current) return { outcome: "invoice-missing" };
    if (current.status === "void") return { outcome: "invoice-voided" };
    await flipPaymentToSuccess(payment, paidAt, input.source);
    return { outcome: "already-settled" };
  }

  await flipPaymentToSuccess(payment, paidAt, input.source);

  try {
    await notifyInvoicePaid(updated);
  } catch (error) {
    console.warn(
      `[payments] notify failed reference=${input.providerReference} invoice=${String(invoice._id)}`,
      error,
    );
  }

  // Record how the settled payment divides between rent and service charge.
  await recordPaymentSplit(payment, invoice, input.amountMinor);

  return { outcome: "settled" };
}
