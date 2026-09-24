import { computeDueDate, periodRange } from "@/lib/invoicing";

export interface InvoiceLease {
  _id?: string | { toString(): string };
  id?: string;
  tenantId: string;
  propertyId: string;
  ownerId: string;
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
}

export type SkipReason = "already-generated" | "non-monthly" | "ended" | "future";

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
 */
export function buildInvoiceForLease(lease: InvoiceLease, period: string, now: Date): InvoiceDraft {
  return {
    invoiceNumber: "",
    tenantId: lease.tenantId,
    propertyId: lease.propertyId,
    leaseId: leaseIdOf(lease),
    ownerId: lease.ownerId,
    period,
    amountDue: lease.rentAmount,
    amountPaid: 0,
    status: "pending",
    dueDate: computeDueDate(period),
    issuedAt: now,
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
}): GenerateResult {
  const { start: periodStart, end: periodEnd } = periodRange(input.period);
  const existingIds = new Set(input.existing.map((invoice) => invoice.leaseId));
  const toCreate: InvoiceDraft[] = [];
  const skipped: SkippedLease[] = [];

  for (const lease of input.leases) {
    const leaseId = leaseIdOf(lease);
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
    toCreate.push(buildInvoiceForLease(lease, input.period, input.now));
  }

  return { toCreate, skipped };
}
