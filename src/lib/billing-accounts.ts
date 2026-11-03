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

export interface BillingAccountLike {
  _id: unknown;
  ownerAdminId?: string;
  legalEntityName?: string;
  invoicePrefix?: string;
}

export interface BillingInvoiceFields {
  billingAccountId: string;
  billingAdminId: string;
  billingSnapshot: {
    legalEntityName: string;
    invoicePrefix: string;
  };
}

/** Maps a resolved account to the denormalised fields stored on an invoice. */
export function billingFieldsFromAccount(
  account: BillingAccountLike | null | undefined,
): BillingInvoiceFields | null {
  if (!account) return null;
  return {
    billingAccountId: String(account._id),
    billingAdminId: account.ownerAdminId ?? "",
    billingSnapshot: {
      legalEntityName: account.legalEntityName ?? "",
      invoicePrefix: account.invoicePrefix ?? "",
    },
  };
}

export interface BillingAccountLookup {
  byUnitId: Map<string, BillingAccountLike>;
  byAccountId: Map<string, BillingAccountLike>;
  byOwnerId: Map<string, BillingAccountLike>;
}

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

/**
 * Batched resolver used by invoice generation. Resolves, in order, an account
 * explicitly referenced by the caller, the unit's denormalised pointer, the
 * unit's active `UnitBillingAssignment`, then the legacy owner's active account.
 */
export async function loadBillingAccountLookup(input: {
  unitIds?: Array<string | null | undefined>;
  billingAccountIds?: Array<string | null | undefined>;
  ownerIds?: Array<string | null | undefined>;
}): Promise<BillingAccountLookup> {
  const unitIds = uniqueIds(input.unitIds ?? []);
  const explicitAccountIds = uniqueIds(input.billingAccountIds ?? []);
  const requestedOwnerIds = uniqueIds(input.ownerIds ?? []);
  const byUnitId = new Map<string, BillingAccountLike>();
  const byAccountId = new Map<string, BillingAccountLike>();
  const byOwnerId = new Map<string, BillingAccountLike>();

  if (unitIds.length === 0 && explicitAccountIds.length === 0 && requestedOwnerIds.length === 0) {
    return { byUnitId, byAccountId, byOwnerId };
  }

  await connectToDatabase();

  const units = unitIds.length
    ? (((await Unit.find({ _id: { $in: unitIds } })
        ?.select?.("_id billingAccountId ownerId")
        ?.lean?.()) as Array<{ _id: unknown; billingAccountId?: string; ownerId?: string }>) ?? [])
    : [];

  const unitPointer = new Map<string, string>();
  const unitOwner = new Map<string, string>();
  for (const unit of units) {
    const unitId = String(unit._id);
    if (unit.billingAccountId) unitPointer.set(unitId, unit.billingAccountId);
    if (unit.ownerId) unitOwner.set(unitId, unit.ownerId);
  }

  const unitsWithoutPointer = unitIds.filter((unitId) => !unitPointer.has(unitId));
  const assignments = unitsWithoutPointer.length
    ? (((await UnitBillingAssignment.find({
        unitId: { $in: unitsWithoutPointer },
        status: "active",
      })
        ?.select?.("unitId billingAccountId")
        ?.lean?.()) as Array<{ unitId: string; billingAccountId: string }>) ?? [])
    : [];
  const assignmentByUnit = new Map<string, string>();
  for (const assignment of assignments) {
    if (assignment.billingAccountId) {
      assignmentByUnit.set(String(assignment.unitId), assignment.billingAccountId);
    }
  }

  const accountIds = uniqueIds([
    ...explicitAccountIds,
    ...unitPointer.values(),
    ...assignmentByUnit.values(),
  ]);
  const accounts = accountIds.length
    ? (((await BillingAccount.find({
        _id: { $in: accountIds },
        status: "active",
        deletedAt: null,
      })?.lean?.()) as BillingAccountLike[]) ?? [])
    : [];
  for (const account of accounts) {
    byAccountId.set(String(account._id), account);
  }

  for (const unitId of unitIds) {
    const pointer = unitPointer.get(unitId);
    const assigned = assignmentByUnit.get(unitId);
    const account =
      (pointer ? byAccountId.get(pointer) : undefined) ??
      (assigned ? byAccountId.get(assigned) : undefined);
    if (account) byUnitId.set(unitId, account);
  }

  const fallbackOwnerIds = uniqueIds([
    ...requestedOwnerIds,
    ...unitIds.filter((unitId) => !byUnitId.has(unitId)).map((unitId) => unitOwner.get(unitId)),
  ]);
  const ownerAccounts = fallbackOwnerIds.length
    ? (((await BillingAccount.find({
        ownerAdminId: { $in: fallbackOwnerIds },
        status: "active",
        deletedAt: null,
      })?.lean?.()) as BillingAccountLike[]) ?? [])
    : [];
  for (const account of ownerAccounts) {
    if (account.ownerAdminId && !byOwnerId.has(account.ownerAdminId)) {
      byOwnerId.set(account.ownerAdminId, account);
    }
  }
  for (const unitId of unitIds) {
    if (byUnitId.has(unitId)) continue;
    const ownerId = unitOwner.get(unitId);
    const account = ownerId ? byOwnerId.get(ownerId) : undefined;
    if (account) byUnitId.set(unitId, account);
  }

  return { byUnitId, byAccountId, byOwnerId };
}

/** Resolves the account for one lease/unit, preferring an explicit lease link. */
export async function resolveBillingAccountForLease(lease: {
  billingAccountId?: string;
  unitId?: string;
  ownerId?: string;
}): Promise<BillingAccountLike | null> {
  const lookup = await loadBillingAccountLookup({
    unitIds: [lease.unitId],
    billingAccountIds: [lease.billingAccountId],
    ownerIds: [lease.ownerId],
  });
  return (
    (lease.billingAccountId ? lookup.byAccountId.get(lease.billingAccountId) : undefined) ??
    (lease.unitId ? lookup.byUnitId.get(lease.unitId) : undefined) ??
    (lease.ownerId ? lookup.byOwnerId.get(lease.ownerId) : undefined) ??
    null
  );
}

/** Finds an owner's active account without creating one. */
export async function resolveBillingAccountForOwner(
  ownerId: string,
): Promise<BillingAccountLike | null> {
  await connectToDatabase();
  const query = BillingAccount.findOne({
    ownerAdminId: ownerId,
    status: "active",
    deletedAt: null,
  });
  if (!query || typeof query.lean !== "function") return null;
  return query.lean() as Promise<BillingAccountLike | null>;
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
