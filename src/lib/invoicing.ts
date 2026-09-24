export const INVOICE_STATUSES = ["draft", "pending", "paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export type DerivedInvoiceStatus = InvoiceStatus | "overdue";

export const INVOICE_METHODS = ["M-Pesa", "Card", "Bank", "Cash", "Other"] as const;
export type InvoiceMethod = (typeof INVOICE_METHODS)[number];

/** Matches a UTC calendar month identifier, e.g. `"2026-09"`. */
export const PERIOD_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Throws a `RangeError` when `period` is not a well-formed `"YYYY-MM"` string.
 * All date helpers and the numbering helper validate through this single gate
 * so malformed input fails before any state (e.g. a counter) is touched.
 */
export function assertValidPeriod(period: string): void {
  if (!PERIOD_REGEX.test(period)) {
    throw new RangeError(`Invalid period "${period}". Expected "YYYY-MM".`);
  }
}

function parsePeriod(period: string): { year: number; month: number } {
  assertValidPeriod(period);
  return { year: Number(period.slice(0, 4)), month: Number(period.slice(5, 7)) };
}

/**
 * Inclusive UTC range for the calendar month: `start` is the first instant of
 * the month and `end` is the last millisecond of the last day of the month.
 */
export function periodRange(period: string): { start: Date; end: Date } {
  const { year, month } = parsePeriod(period);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1) - 1);
  return { start, end };
}

/** Day-of-month of the last day of `period` (handles leap years and 30/31-day months). */
export function lastDayOf(period: string): number {
  return periodRange(period).end.getUTCDate();
}

/** Due date locked at the 5th of the month AFTER `period`, in UTC. */
export function computeDueDate(period: string): Date {
  const { year, month } = parsePeriod(period);
  return new Date(Date.UTC(year, month, 5));
}

/**
 * Boundary-inclusive check: a lease is active within the period when it started
 * on or before the period end and either has no end date or ends on or after
 * the period start.
 */
export function isLeaseActiveForPeriod(
  lease: { startDate: Date; endDate?: Date | null },
  periodStart: Date,
  periodEnd: Date,
): boolean {
  return (
    lease.startDate.getTime() <= periodEnd.getTime() &&
    (lease.endDate == null || lease.endDate.getTime() >= periodStart.getTime())
  );
}

/**
 * Returns the stored status unchanged except for a stored `"pending"` invoice
 * whose due date has passed, which derives as `"overdue"`. `draft`, `paid` and
 * `void` are never flipped. `overdue` is derived at read time and never stored.
 */
export function deriveStatus(
  invoice: { status: string; dueDate: Date },
  now: Date,
): DerivedInvoiceStatus {
  if (invoice.status === "pending" && invoice.dueDate.getTime() < now.getTime()) {
    return "overdue";
  }
  return invoice.status as InvoiceStatus;
}

/**
 * Shallow copies an invoice doc, normalizing `status` through `deriveStatus`
 * and appending a derived `overdue` boolean. All original fields are kept.
 */
export function serializeInvoice<T extends { status: string; dueDate: Date }>(
  doc: T,
  now: Date,
): T & { status: DerivedInvoiceStatus; overdue: boolean } {
  const status = deriveStatus(doc, now);
  return { ...doc, status, overdue: status === "overdue" };
}

/** `"YYYY-MM"` of `now` in UTC (e.g. September 2026 -> `"2026-09"`). */
export function currentPeriod(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

// State-machine guards. Derived "overdue" is treated as its stored "pending"
// status so mark-paid/void stay legal on serialized (overdue) invoices; only
// "draft" is deletable.

export function canMarkPaid(status: DerivedInvoiceStatus): boolean {
  return status === "draft" || status === "pending" || status === "overdue";
}

/**
 * Online payment guard — deliberately narrower than `canMarkPaid`: only a
 * stored `pending` invoice with zero balance is payable online (drafts are not
 * payable online, and a partially-paid invoice has no full-settlement charge
 * path in this round).
 */
export function canPayOnline(invoice: { status: string; amountPaid: number }): boolean {
  return invoice.status === "pending" && invoice.amountPaid === 0;
}

export function canVoid(status: DerivedInvoiceStatus): boolean {
  return status === "draft" || status === "pending" || status === "overdue";
}

export function canDelete(status: DerivedInvoiceStatus): boolean {
  return status === "draft";
}
