import { computeDueDate, periodRange } from "@/lib/invoicing";

export interface InvoiceLease {
  _id?: string | { toString(): string };
  id?: string;
  tenantId: string;
  tenantType?: "residential" | "commercial" | "owning";
  propertyId: string;
  ownerId: string;
  unitId?: string;
  rentAmount: number;
  frequency: string;
  startDate: Date;
  endDate?: Date | null;
  status?: string;
}

/** Per-unit rent/service-charge configuration used when generating an invoice. */
export interface UnitCharge {
  serviceChargeAmount: number;
  rentIncludesServiceCharge: boolean;
  rentSharePercent: number;
  serviceChargeSharePercent: number;
}

/** Emitted invoice fields, ready for numbered insert by the route. */
export interface InvoiceDraft {
  invoiceNumber: string;
  tenantId: string;
  propertyId: string;
  leaseId: string;
  ownerId: string;
  period: string;
  amountDue: number;
  amountPaid: number;
  status: "pending";
  dueDate: Date;
  issuedAt: Date;
  rentAmount: number;
  serviceChargeAmount: number;
  rentIncludesServiceCharge: boolean;
}

export type SkipReason = "already-generated" | "non-monthly" | "ended" | "future" | "owning-tenant";

export interface SkippedLease {
  leaseId: string;
  reason: SkipReason;
}

export interface GenerateResult {
  toCreate: InvoiceDraft[];
  skipped: SkippedLease[];
}

/**
 * Builds the draft doc for one lease-month. `invoiceNumber` is left as `""` —
 * numbering needs the atomic counter, so the route assigns it afterwards via
 * `nextInvoiceNumber`.
 *
 * When `unitCharge` is supplied, `amountDue` and the rent/service-charge
 * breakdown reflect the unit's configuration:
 *  - rent includes service charge: `amountDue = rentAmount` (the collected
 *    total) and the breakdown comes from `unitCharge`.
 *  - separate billing: `amountDue = rentAmount + serviceChargeAmount`.
 * Without `unitCharge`, `amountDue = rentAmount` and the service charge is 0.
 */
export function buildInvoiceForLease(
  lease: InvoiceLease,
  period: string,
  now: Date,
  unitCharge: UnitCharge | null = null,
): InvoiceDraft {
  const rentAmount = lease.rentAmount;
  let amountDue: number;
  let rentAmountField: number;
  let serviceChargeAmountField: number;
  let rentIncludesServiceCharge = false;

  if (unitCharge) {
    rentIncludesServiceCharge = unitCharge.rentIncludesServiceCharge;
    if (rentIncludesServiceCharge) {
      // Collected rent already includes the service charge; split by shares.
      amountDue = rentAmount;
      rentAmountField = rentAmount * (unitCharge.rentSharePercent / 100);
      serviceChargeAmountField = rentAmount - rentAmountField;
    } else {
      // Rent and service charge billed separately as a single invoice total.
      amountDue = rentAmount + unitCharge.serviceChargeAmount;
      rentAmountField = rentAmount;
      serviceChargeAmountField = unitCharge.serviceChargeAmount;
    }
  } else {
    amountDue = rentAmount;
    rentAmountField = rentAmount;
    serviceChargeAmountField = 0;
  }

  return {
    invoiceNumber: "",
    tenantId: lease.tenantId,
    propertyId: lease.propertyId,
    leaseId: leaseIdOf(lease),
    ownerId: lease.ownerId,
    period,
    amountDue,
    amountPaid: 0,
    status: "pending",
    dueDate: computeDueDate(period),
    issuedAt: now,
    rentAmount: rentAmountField,
    serviceChargeAmount: serviceChargeAmountField,
    rentIncludesServiceCharge,
  };
}

function leaseIdOf(lease: InvoiceLease): string {
  return String(lease._id ?? lease.id ?? "");
}

/**
 * Pure sync planner: decides which leases get a draft for `period` and why the
 * rest are skipped. Does not hit the DB and does not assign invoice numbers.
 * The future-start check runs after the ended check so a lease can only match
 * one reason (a lease that starts after the period end is never "ended").
 */
export function generateForPeriod(input: {
  leases: InvoiceLease[];
  existing: Array<{ leaseId: string }>;
  period: string;
  now: Date;
  // Optional per-lease rent/service-charge breakdown, keyed by lease id.
  unitChargeByLeaseId?: Map<string, UnitCharge>;
}): GenerateResult {
  const { start: periodStart, end: periodEnd } = periodRange(input.period);
  const existingIds = new Set(input.existing.map((invoice) => invoice.leaseId));
  const toCreate: InvoiceDraft[] = [];
  const skipped: SkippedLease[] = [];
  const unitChargeByLeaseId = input.unitChargeByLeaseId ?? new Map();

  for (const lease of input.leases) {
    const leaseId = leaseIdOf(lease);
    if (lease.tenantType === "owning") {
      skipped.push({ leaseId, reason: "owning-tenant" });
      continue;
    }
    if (existingIds.has(leaseId)) {
      skipped.push({ leaseId, reason: "already-generated" });
      continue;
    }
    if (lease.frequency !== "monthly") {
      skipped.push({ leaseId, reason: "non-monthly" });
      continue;
    }
    if (
      lease.status === "ended" ||
      (lease.endDate != null && lease.endDate.getTime() < periodStart.getTime())
    ) {
      skipped.push({ leaseId, reason: "ended" });
      continue;
    }
    if (lease.startDate.getTime() > periodEnd.getTime()) {
      skipped.push({ leaseId, reason: "future" });
      continue;
    }
    toCreate.push(
      buildInvoiceForLease(
        lease,
        input.period,
        input.now,
        unitChargeByLeaseId.get(leaseId) ?? null,
      ),
    );
  }

  return { toCreate, skipped };
}
