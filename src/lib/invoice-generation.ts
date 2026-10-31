import { computeDueDate, periodRange } from "@/lib/invoicing";
import type { ServiceFeeBreakdownItem, UnitServiceFee } from "@/lib/service-fees";

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
  serviceFeeItems: ServiceFeeBreakdownItem[];
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
 * When `serviceFee` is supplied, `amountDue` and the rent/service-fee
 * breakdown reflect the unit's configuration:
 *  - legacy inclusive rent: `amountDue = rentAmount` (the collected total) and
 *    the service fee is the agreed share of that total.
 *  - separate billing: `amountDue = rentAmount + serviceFee.total`.
 * Without `serviceFee`, `amountDue = rentAmount` and the service fee is 0.
 */
export function buildInvoiceForLease(
  lease: InvoiceLease,
  period: string,
  now: Date,
  serviceFee: UnitServiceFee | null = null,
): InvoiceDraft {
  const rentAmount = lease.rentAmount;
  let amountDue: number;
  let rentAmountField: number;
  let serviceChargeAmountField: number;
  let rentIncludesServiceCharge = false;
  let serviceFeeItems: ServiceFeeBreakdownItem[] = [];

  if (serviceFee) {
    rentIncludesServiceCharge = serviceFee.rentIncludesServiceCharge;
    if (rentIncludesServiceCharge) {
      // Legacy inclusive rent: preserve the collected total and split it by
      // the agreed percentages until the lease is renewed.
      amountDue = rentAmount;
      rentAmountField = Math.round(rentAmount * (serviceFee.rentSharePercent / 100));
      serviceChargeAmountField = rentAmount - rentAmountField;
    } else {
      // Modern billing: rent and itemized service fee are separate lines.
      serviceChargeAmountField = serviceFee.total;
      amountDue = rentAmount + serviceChargeAmountField;
      rentAmountField = rentAmount;
      serviceFeeItems = serviceFee.breakdown;
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
    serviceFeeItems,
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
  // Optional per-lease service-fee breakdown, keyed by lease id.
  unitChargeByLeaseId?: Map<string, UnitServiceFee>;
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
