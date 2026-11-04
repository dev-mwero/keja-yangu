import { randomBytes } from "node:crypto";
import { writeAuditEvent } from "@/lib/audit";
import type {
  CommissionAccrualKind,
  CommissionAccrualStatus,
  CommissionBasis,
} from "@/lib/domain-enums";
import { connectToDatabase } from "@/lib/mongoose";
import { toMinorUnits } from "@/lib/payments/provider";
import type { Role } from "@/lib/permissions";
import { Attribution } from "@/models/Attribution";
import { CommissionAccrual } from "@/models/CommissionAccrual";
import { CommissionAgreement } from "@/models/CommissionAgreement";
import { CommissionPayout } from "@/models/CommissionPayout";

export const COMMISSION_CURRENCY = "KES";
export const DEFAULT_TAX_BPS = 0;
export const DEFAULT_ELIGIBILITY_DELAY_DAYS = 7;
export const CLAWBACK_WINDOW_DAYS = 30;
export const DEFAULT_MIN_PAYOUT_MINOR = 0;

const DAY_MS = 24 * 60 * 60 * 1000;
const PERCENT_DENOMINATOR = 10_000;

function readNonNegativeIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function commissionEligibilityDelayDays(): number {
  return readNonNegativeIntEnv("COMMISSION_ELIGIBILITY_DELAY_DAYS", DEFAULT_ELIGIBILITY_DELAY_DAYS);
}

export function commissionMinPayoutMinor(): number {
  return readNonNegativeIntEnv("COMMISSION_MIN_PAYOUT_MINOR", DEFAULT_MIN_PAYOUT_MINOR);
}

export function commissionClawbackWindowDays(): number {
  return readNonNegativeIntEnv("COMMISSION_CLAWBACK_WINDOW_DAYS", CLAWBACK_WINDOW_DAYS);
}

/** Half-up integer rounding used for every commission amount. */
export function roundHalfUp(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.floor((numerator + denominator / 2) / denominator);
}

export interface CommissionAgreementTerms {
  basis: CommissionBasis;
  rateBps?: number;
  fixedAmountMinor?: number;
  taxBps?: number;
  currency?: string;
  paymentTerms?: string;
}

export interface CommissionCalculationInput {
  agreement: CommissionAgreementTerms;
  collectedRentMinor: number;
  oneMonthRentMinor: number;
  isFirstRentInvoice: boolean;
}

export interface CommissionCalculation {
  kind: CommissionAccrualKind;
  basisMinor: number;
  grossMinor: number;
  taxMinor: number;
  netMinor: number;
  currency: string;
}

/**
 * Pure commission calculator. Amounts are integer minor units.
 * Returns null when the agreement earns nothing for this invoice (for example a
 * later invoice under a first-month-only agreement, or a zero basis).
 */
export function computeCommission(input: CommissionCalculationInput): CommissionCalculation | null {
  const { agreement } = input;
  const collectedRentMinor = Math.max(0, Math.floor(input.collectedRentMinor));
  const oneMonthRentMinor = Math.max(0, Math.floor(input.oneMonthRentMinor));
  const rateBps = Math.max(0, agreement.rateBps ?? 0);
  const taxBps = Math.max(0, agreement.taxBps ?? 0);

  let kind: CommissionAccrualKind = "recurring";
  let basisMinor = 0;
  let grossMinor = 0;

  if (agreement.basis === "first_month_rent") {
    if (!input.isFirstRentInvoice) return null;
    kind = "initial";
    basisMinor = Math.min(collectedRentMinor, oneMonthRentMinor);
    grossMinor = roundHalfUp(basisMinor * rateBps, PERCENT_DENOMINATOR);
  } else if (agreement.basis === "percentage_of_rent") {
    basisMinor = collectedRentMinor;
    grossMinor = roundHalfUp(basisMinor * rateBps, PERCENT_DENOMINATOR);
  } else if (agreement.basis === "fixed") {
    basisMinor = 0;
    grossMinor = Math.max(0, agreement.fixedAmountMinor ?? 0);
  }

  if (grossMinor <= 0) return null;

  const taxMinor = roundHalfUp(grossMinor * taxBps, PERCENT_DENOMINATOR);

  return {
    kind,
    basisMinor,
    grossMinor,
    taxMinor,
    netMinor: grossMinor - taxMinor,
    currency: agreement.currency || COMMISSION_CURRENCY,
  };
}

export interface SettledInvoiceLike {
  _id?: unknown;
  leaseId?: string;
  rentAmount?: number;
  amountPaid?: number;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === 11000
  );
}

interface CommissionContext {
  attribution: any;
  agreement: any;
  calculation: CommissionCalculation;
  leaseId: string;
  invoiceId: string;
}

async function resolveCommissionContext(
  invoice: SettledInvoiceLike,
): Promise<CommissionContext | null> {
  const leaseId = String(invoice.leaseId ?? "");
  const invoiceId = String(invoice._id ?? "");
  if (!leaseId || !invoiceId) return null;

  const attribution = (await Attribution.findOne({
    leaseId,
    status: "confirmed",
  }).lean()) as any;
  if (!attribution || !attribution.brokerUserId) return null;

  const agreement = (await CommissionAgreement.findById(
    attribution.commissionAgreementId,
  ).lean()) as any | null;
  if (!agreement) return null;

  const priorInitial = await CommissionAccrual.countDocuments({
    attributionId: String(attribution._id),
    kind: "initial",
    status: { $ne: "reversed" },
  });

  const collectedRentMajor = invoice.rentAmount ?? invoice.amountPaid ?? 0;
  const calculation = computeCommission({
    agreement: {
      basis: agreement.basis,
      rateBps: agreement.rateBps,
      fixedAmountMinor: agreement.fixedAmountMinor,
      taxBps: agreement.taxBps ?? DEFAULT_TAX_BPS,
      currency: agreement.currency,
    },
    collectedRentMinor: toMinorUnits(collectedRentMajor),
    oneMonthRentMinor: toMinorUnits(collectedRentMajor),
    isFirstRentInvoice: priorInitial === 0,
  });

  if (!calculation) return null;

  return { attribution, agreement, calculation, leaseId, invoiceId };
}

/**
 * Compute the commission that a settlement would accrue without writing it.
 * Used by the backfill dry-run so finance can compare projected totals.
 */
export async function previewCommissionForSettledInvoice(invoice: SettledInvoiceLike) {
  await connectToDatabase();
  const context = await resolveCommissionContext(invoice);
  if (!context) return null;

  const { attribution, agreement, calculation, leaseId, invoiceId } = context;
  return {
    invoiceId,
    leaseId,
    attributionId: String(attribution._id),
    agreementId: String(agreement._id),
    brokerUserId: attribution.brokerUserId,
    propertyId: String(attribution.propertyId || ""),
    unitId: String(attribution.unitId || ""),
    ...calculation,
  };
}

/**
 * Create a shadow accrual for a settled invoice. Idempotent on
 * `{ attributionId, invoiceId, kind }`; safe to call from every settlement path.
 */
export async function accrueCommissionForSettledInvoice(invoice: SettledInvoiceLike) {
  await connectToDatabase();
  const context = await resolveCommissionContext(invoice);
  if (!context) return null;

  const { attribution, agreement, calculation, leaseId, invoiceId } = context;

  const eligibilityAt = new Date(Date.now() + commissionEligibilityDelayDays() * DAY_MS);

  try {
    const created = await CommissionAccrual.create({
      attributionId: String(attribution._id),
      agreementId: String(agreement._id),
      brokerUserId: attribution.brokerUserId,
      propertyId: attribution.propertyId || "",
      unitId: attribution.unitId || "",
      leaseId,
      invoiceId,
      kind: calculation.kind,
      snapshot: {
        basis: agreement.basis,
        rateBps: agreement.rateBps ?? 0,
        fixedAmountMinor: agreement.fixedAmountMinor ?? 0,
        taxBps: agreement.taxBps ?? DEFAULT_TAX_BPS,
        currency: calculation.currency,
        paymentTerms: agreement.paymentTerms || "",
      },
      basisMinor: calculation.basisMinor,
      grossMinor: calculation.grossMinor,
      taxMinor: calculation.taxMinor,
      netMinor: calculation.netMinor,
      currency: calculation.currency,
      status: "pending",
      eligibilityAt,
      metadata: { shadow: true },
    });

    const createdDoc = (await CommissionAccrual.findById(created._id).lean()) as any;

    await writeAuditEvent({
      actor: { userId: "system", role: "system" },
      action: "commission.accrued",
      entityType: "commission_accrual",
      entityId: String(createdDoc._id),
      scope: {
        propertyId: attribution.propertyId,
        unitId: attribution.unitId,
      },
      after: createdDoc,
    });

    return createdDoc;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return (await CommissionAccrual.findOne({
        attributionId: String(attribution._id),
        invoiceId,
        kind: calculation.kind,
      }).lean()) as any;
    }
    throw error;
  }
}

/** Promote pending accruals whose eligibility delay has elapsed. */
export async function markEligibleAccruals(now = new Date()): Promise<number> {
  await connectToDatabase();
  const result = await CommissionAccrual.updateMany(
    { status: "pending", eligibilityAt: { $lte: now } },
    { $set: { status: "eligible" } },
  );
  return result.modifiedCount ?? 0;
}

export interface CommissionActor {
  userId: string;
  role: Role;
}

function assertRole(actor: CommissionActor, allowed: Role[], message: string) {
  if (!allowed.includes(actor.role)) {
    throw new Error(message);
  }
}

export async function approveAccrual(actor: CommissionActor, accrualId: string) {
  await connectToDatabase();
  assertRole(actor, ["admin", "system-admin"], "Only administrators can approve commission");

  const accrual = (await CommissionAccrual.findById(accrualId).lean()) as any;
  if (!accrual) throw new Error("Commission accrual not found");
  if (accrual.status !== "eligible") {
    throw new Error(`Only eligible accruals can be approved (current: ${accrual.status})`);
  }

  await CommissionAccrual.updateOne(
    { _id: accrualId, status: "eligible" },
    { $set: { status: "approved", approvedByUserId: actor.userId, approvedAt: new Date() } },
  );

  const updated = (await CommissionAccrual.findById(accrualId).lean()) as any;

  await writeAuditEvent({
    actor,
    action: "commission.approved",
    entityType: "commission_accrual",
    entityId: accrualId,
    scope: { propertyId: accrual.propertyId, unitId: accrual.unitId },
    before: { status: accrual.status },
    after: { status: "approved" },
  });

  return updated;
}

export async function createPayoutBatch(
  actor: CommissionActor,
  brokerUserId: string,
  accrualIds?: string[],
) {
  await connectToDatabase();
  assertRole(actor, ["system-admin"], "Only a system administrator can create payouts");

  await markEligibleAccruals();

  const filter: Record<string, unknown> = {
    brokerUserId,
    status: "approved",
    payoutId: "",
  };
  if (accrualIds?.length) filter._id = { $in: accrualIds };

  const accruals = (await CommissionAccrual.find(filter).lean()) as any[];
  if (accruals.length === 0) {
    throw new Error("No approved commission accruals are ready for payout");
  }

  const grossMinor = accruals.reduce((sum, a) => sum + (a.grossMinor ?? 0), 0);
  const taxMinor = accruals.reduce((sum, a) => sum + (a.taxMinor ?? 0), 0);
  const netMinor = accruals.reduce((sum, a) => sum + (a.netMinor ?? 0), 0);

  if (netMinor < commissionMinPayoutMinor()) {
    throw new Error("Payout total is below the configured minimum threshold");
  }

  const batchCode = `pay_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
  const payout = await CommissionPayout.create({
    batchCode,
    brokerUserId,
    accrualIds: accruals.map((a) => String(a._id)),
    grossMinor,
    taxMinor,
    netMinor,
    currency: accruals[0].currency || COMMISSION_CURRENCY,
    status: "approved",
    createdByUserId: actor.userId,
    approvedByUserId: actor.userId,
  });

  const payoutDoc = (await CommissionPayout.findById(payout._id).lean()) as any;

  await CommissionAccrual.updateMany(
    { _id: { $in: accruals.map((a) => a._id) } },
    { $set: { payoutId: String(payout._id) } },
  );

  await writeAuditEvent({
    actor,
    action: "commission.payout_created",
    entityType: "commission_payout",
    entityId: String(payoutDoc._id),
    after: {
      batchCode,
      brokerUserId,
      accrualIds: payoutDoc.accrualIds,
      netMinor,
    },
  });

  return payoutDoc;
}

export async function executePayout(
  actor: CommissionActor,
  payoutId: string,
  providerReference?: string,
) {
  await connectToDatabase();
  assertRole(actor, ["system-admin"], "Only a system administrator can execute payouts");

  if (process.env.COMMISSION_PAYOUTS_ENABLED !== "true") {
    throw new Error("Commission payouts are disabled (shadow mode)");
  }

  const payout = (await CommissionPayout.findById(payoutId).lean()) as any;
  if (!payout) throw new Error("Commission payout not found");
  if (payout.status !== "approved") {
    throw new Error(`Payout cannot be executed from status '${payout.status}'`);
  }

  const paidAt = new Date();
  await CommissionPayout.updateOne(
    { _id: payoutId, status: "approved" },
    {
      $set: {
        status: "paid",
        executedByUserId: actor.userId,
        paidAt,
        providerReference: providerReference || "",
      },
    },
  );

  await CommissionAccrual.updateMany(
    { payoutId, status: "approved" },
    { $set: { status: "paid", paidAt } },
  );

  const updated = (await CommissionPayout.findById(payoutId).lean()) as any;

  await writeAuditEvent({
    actor,
    action: "commission.payout_executed",
    entityType: "commission_payout",
    entityId: payoutId,
    before: { status: payout.status },
    after: { status: "paid", providerReference: providerReference || "" },
  });

  return updated;
}

export async function failPayout(actor: CommissionActor, payoutId: string, reason: string) {
  await connectToDatabase();
  assertRole(actor, ["system-admin"], "Only a system administrator can fail a payout");

  const payout = (await CommissionPayout.findById(payoutId).lean()) as any;
  if (!payout) throw new Error("Commission payout not found");
  if (payout.status === "paid") throw new Error("A paid payout is immutable");

  await CommissionPayout.updateOne(
    { _id: payoutId },
    { $set: { status: "failed", failureReason: reason } },
  );

  await CommissionAccrual.updateMany(
    { payoutId, status: "approved" },
    { $set: { status: "approved", payoutId: "" } },
  );

  const updated = (await CommissionPayout.findById(payoutId).lean()) as any;

  await writeAuditEvent({
    actor,
    action: "commission.payout_failed",
    entityType: "commission_payout",
    entityId: payoutId,
    after: { status: "failed", reason },
  });

  return updated;
}

export async function createClawback(actor: CommissionActor, accrualId: string, reason: string) {
  await connectToDatabase();
  assertRole(actor, ["system-admin"], "Only a system administrator can claw back commission");

  const accrual = (await CommissionAccrual.findById(accrualId).lean()) as any;
  if (!accrual) throw new Error("Commission accrual not found");
  if (accrual.status === "reversed" || accrual.kind === "clawback") {
    throw new Error("This accrual has already been reversed");
  }

  if (accrual.status !== "paid") {
    await CommissionAccrual.updateOne(
      { _id: accrualId },
      { $set: { status: "reversed", reversedAt: new Date(), reversalReason: reason } },
    );

    await writeAuditEvent({
      actor,
      action: "commission.reversed",
      entityType: "commission_accrual",
      entityId: accrualId,
      before: { status: accrual.status },
      after: { status: "reversed", reason },
    });

    return (await CommissionAccrual.findById(accrualId).lean()) as any;
  }

  const clawbackWindowDays = commissionClawbackWindowDays();
  const paidAtMs = accrual.paidAt ? new Date(accrual.paidAt).getTime() : null;
  if (paidAtMs && Date.now() - paidAtMs > clawbackWindowDays * DAY_MS) {
    throw new Error(`Clawback window of ${clawbackWindowDays} days has expired`);
  }

  const clawback = await CommissionAccrual.create({
    attributionId: accrual.attributionId || "",
    agreementId: accrual.agreementId || "",
    brokerUserId: accrual.brokerUserId,
    propertyId: accrual.propertyId || "",
    unitId: accrual.unitId || "",
    leaseId: accrual.leaseId || "",
    invoiceId: accrual.invoiceId,
    kind: "clawback",
    snapshot: accrual.snapshot,
    basisMinor: 0,
    grossMinor: -Math.abs(accrual.netMinor ?? 0),
    taxMinor: 0,
    netMinor: -Math.abs(accrual.netMinor ?? 0),
    currency: accrual.currency || COMMISSION_CURRENCY,
    status: "eligible",
    eligibilityAt: new Date(),
    metadata: { clawsBackAccrualId: String(accrual._id), reason },
  });

  const clawbackDoc = (await CommissionAccrual.findById(clawback._id).lean()) as any;

  await writeAuditEvent({
    actor,
    action: "commission.clawback_created",
    entityType: "commission_accrual",
    entityId: String(clawbackDoc._id),
    before: { status: accrual.status },
    after: { status: "eligible", clawsBackAccrualId: String(accrual._id), reason },
  });

  return clawbackDoc;
}

export interface CommissionDuplicateAccrual {
  attributionId: string;
  invoiceId: string;
  kind: string;
  accrualIds: string[];
}

export interface CommissionReconciliationReport {
  totalPaid: number;
  paidWithoutBatch: Array<{ accrualId: string; payoutId: string }>;
  paidButBatchNotPaid: Array<{ accrualId: string; payoutId: string }>;
  duplicateAccruals: CommissionDuplicateAccrual[];
  ok: boolean;
}

export async function reconcileCommissions(): Promise<CommissionReconciliationReport> {
  await connectToDatabase();

  const paid = (await CommissionAccrual.find({ status: "paid" }).lean()) as any[];
  const liveAccruals = (await CommissionAccrual.find({ status: { $ne: "reversed" } })
    .select("_id attributionId invoiceId kind")
    .lean()) as any[];
  const payoutIds = [...new Set(paid.map((a) => String(a.payoutId || "")).filter(Boolean))];
  const payouts = (await CommissionPayout.find({ _id: { $in: payoutIds } })
    .select("_id status")
    .lean()) as any[];
  const payoutStatus = new Map(payouts.map((p) => [String(p._id), String(p.status)]));

  const paidWithoutBatch: Array<{ accrualId: string; payoutId: string }> = [];
  const paidButBatchNotPaid: Array<{ accrualId: string; payoutId: string }> = [];

  for (const accrual of paid) {
    const payoutId = String(accrual.payoutId || "");
    if (!payoutId) {
      paidWithoutBatch.push({ accrualId: String(accrual._id), payoutId });
    } else if (payoutStatus.get(payoutId) !== "paid") {
      paidButBatchNotPaid.push({ accrualId: String(accrual._id), payoutId });
    }
  }

  const grouped = new Map<string, CommissionDuplicateAccrual>();
  for (const accrual of liveAccruals) {
    const attributionId = String(accrual.attributionId || "");
    const invoiceId = String(accrual.invoiceId || "");
    const kind = String(accrual.kind || "");
    if (!attributionId || !invoiceId) continue;
    const key = `${attributionId}|${invoiceId}|${kind}`;
    const group = grouped.get(key) ?? { attributionId, invoiceId, kind, accrualIds: [] };
    group.accrualIds.push(String(accrual._id));
    grouped.set(key, group);
  }
  const duplicateAccruals = [...grouped.values()].filter((group) => group.accrualIds.length > 1);

  return {
    totalPaid: paid.length,
    paidWithoutBatch,
    paidButBatchNotPaid,
    duplicateAccruals,
    ok:
      paidWithoutBatch.length === 0 &&
      paidButBatchNotPaid.length === 0 &&
      duplicateAccruals.length === 0,
  };
}

/** Helper for tests and admin filters. */
export function isCommissionStatus(value: string): value is CommissionAccrualStatus {
  return ["pending", "eligible", "approved", "paid", "reversed", "disputed"].includes(value);
}
