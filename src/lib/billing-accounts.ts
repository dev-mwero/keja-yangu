import { assertValidPeriod } from "@/lib/invoicing";
import { connectToDatabase } from "@/lib/mongoose";
import { BillingAccount, type BillingAccountDocument } from "@/models/BillingAccount";
import { Unit } from "@/models/Unit";
import { UnitBillingAssignment } from "@/models/UnitBillingAssignment";

/**
 * Derives a clean, uppercase 3-to-6 alphanumeric prefix for invoice numbering.
 */
export function sanitizeInvoicePrefix(candidate: string): string {
  const cleaned = candidate.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned.length >= 2 ? cleaned.slice(0, 6) : "INV";
}

/**
 * Atomically reserves the next invoice number for a given billing account
 * within a period by incrementing `BillingAccount.invoiceCounters.<period>`.
 * Formats as `${prefix}-${YYYYMM}-${seq}` with 4+ digits zero-padded.
 */
export async function nextBillingAccountInvoiceNumber(
  billingAccountId: string,
  period: string,
): Promise<{ invoiceNumber: string; prefix: string; seq: number }> {
  assertValidPeriod(period);
  await connectToDatabase();

  const account = await BillingAccount.findOneAndUpdate(
    { _id: billingAccountId },
    { $inc: { [`invoiceCounters.${period}`]: 1 } },
    { new: true, upsert: false },
  )
    .select("invoicePrefix invoiceCounters")
    .lean();

  if (!account) {
    throw new Error(`Billing account ${billingAccountId} not found`);
  }

  const prefix = account.invoicePrefix || "INV";
  const counters = account.invoiceCounters as
    | Map<string, number>
    | Record<string, number>
    | undefined;
  const seq = (counters instanceof Map ? counters.get(period) : counters?.[period]) ?? 1;
  const periodDigits = period.replace("-", "");
  const invoiceNumber = `${prefix}-${periodDigits}-${String(seq).padStart(4, "0")}`;

  return { invoiceNumber, prefix, seq };
}

/**
 * Finds the active billing account for an owner, or creates a default one.
 */
export async function getOrCreateBillingAccountForOwner(
  ownerAdminId: string,
  defaults: { legalEntityName?: string; invoicePrefix?: string } = {},
): Promise<BillingAccountDocument> {
  await connectToDatabase();

  const existing = await BillingAccount.findOne({
    ownerAdminId,
    status: "active",
    deletedAt: null,
  });
  if (existing) {
    return existing;
  }

  const legalEntityName = defaults.legalEntityName?.trim() || "Property Management";
  let invoicePrefix = sanitizeInvoicePrefix(defaults.invoicePrefix || "INV");

  // If the desired prefix is taken by another account, append a deterministic suffix
  const prefixTaken = await BillingAccount.exists({
    invoicePrefix,
    deletedAt: null,
  });
  if (prefixTaken) {
    invoicePrefix = `${invoicePrefix.slice(0, 4)}${ownerAdminId.slice(-2).toUpperCase()}`;
  }

  return BillingAccount.create({
    ownerAdminId,
    legalEntityName,
    invoicePrefix,
    status: "active",
    legacyOwnerId: ownerAdminId,
  });
}

/**
 * Resolves the billing account assigned to a unit.
 * Checks the denormalised `Unit.billingAccountId` pointer, falling back
 * to the active `UnitBillingAssignment`.
 */
export async function resolveBillingAccountForUnit(
  unitId: string,
): Promise<BillingAccountDocument | null> {
  await connectToDatabase();

  const unit = await Unit.findById(unitId).select("billingAccountId ownerId").lean();
  if (!unit) return null;

  let billingAccountId = unit.billingAccountId;

  if (!billingAccountId) {
    const activeAssignment = await UnitBillingAssignment.findOne({
      unitId,
      status: "active",
    })
      .select("billingAccountId")
      .lean();

    if (activeAssignment?.billingAccountId) {
      billingAccountId = activeAssignment.billingAccountId;
      // Sync back denormalised pointer
      await Unit.updateOne({ _id: unitId }, { $set: { billingAccountId } }).catch(() => undefined);
    }
  }

  if (billingAccountId) {
    const account = await BillingAccount.findOne({
      _id: billingAccountId,
      status: "active",
      deletedAt: null,
    });
    if (account) return account;
  }

  // Fallback: lookup billing account by legacy unit ownerId
  if (unit.ownerId) {
    return BillingAccount.findOne({
      ownerAdminId: unit.ownerId,
      status: "active",
      deletedAt: null,
    });
  }

  return null;
}

/**
 * Assigns a unit to a billing account, closing any existing active assignment.
 */
export async function assignBillingAccountToUnit(
  unitId: string,
  billingAccountId: string,
  assignedByUserId: string,
  reason = "",
): Promise<void> {
  await connectToDatabase();

  const now = new Date();

  // Close previous active assignments
  await UnitBillingAssignment.updateMany(
    { unitId, status: "active" },
    { $set: { status: "ended", effectiveTo: now } },
  );

  // Create new active assignment
  await UnitBillingAssignment.create({
    unitId,
    billingAccountId,
    effectiveFrom: now,
    status: "active",
    assignedByUserId,
    reason,
  });

  // Sync denormalised pointer on the Unit
  await Unit.updateOne({ _id: unitId }, { $set: { billingAccountId } });
}
