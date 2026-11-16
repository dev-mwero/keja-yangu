import { assertValidPeriod } from "@/lib/invoicing";
import { connectToDatabase } from "@/lib/mongoose";
import { BillingAccount } from "@/models/BillingAccount";
import { User } from "@/models/User";

/**
 * Formats a sequence number into `${prefix}-YYYYMM-NNNN`, zero-padded to at least
 * four digits (grows past 9999 without capping).
 */
export function formatInvoiceNumber(period: string, seq: number, prefix = "INV"): string {
  assertValidPeriod(period);
  return `${prefix}-${period.replace("-", "")}-${String(seq).padStart(4, "0")}`;
}

/**
 * Atomically reserves the next invoice number for an owner or billing account within a period.
 * If `options.billingAccountId` is provided, increments `BillingAccount.invoiceCounters.<period>`.
 * The unique `invoiceNumber` index on Invoice is the duplicate backstop.
 */
export async function nextInvoiceNumber(
  ownerId: string,
  period: string,
  options: { billingAccountId?: string } = {},
): Promise<string> {
  assertValidPeriod(period);
  await connectToDatabase();

  if (options.billingAccountId) {
    try {
      const account = await BillingAccount.findOneAndUpdate(
        { _id: options.billingAccountId },
        { $inc: { [`invoiceCounters.${period}`]: 1 } },
        { new: true, upsert: false },
      )
        .select("invoicePrefix invoiceCounters")
        .lean();

      if (account) {
        const prefix = account.invoicePrefix || "INV";
        const counters = account.invoiceCounters as
          | Map<string, number>
          | Record<string, number>
          | undefined;
        const seq = (counters instanceof Map ? counters.get(period) : counters?.[period]) ?? 1;
        return formatInvoiceNumber(period, seq, prefix);
      }
    } catch {
      // Fall through to legacy owner counter
    }
  }

  const user = await User.findOneAndUpdate(
    { _id: ownerId },
    { $inc: { [`invoiceCounters.${period}`]: 1 } },
    { new: true, upsert: false },
  )
    .select("invoiceCounters")
    .lean();
  const seq = user?.invoiceCounters?.[period] ?? 1;
  return formatInvoiceNumber(period, seq);
}

/**
 * Atomically reserves a contiguous block of `count` invoice numbers for an
 * owner or billing account within a period and returns them in sequence
 * order. A single `$inc` by `count` replaces the per-draft counter round
 * trips of the serial path; the position of the block is derived from the
 * returned counter (it is the block's LAST value, so the first number is
 * `end - count + 1`). Falls back to the owner counter when the billing
 * account is missing, mirroring `nextInvoiceNumber`; a missing owner counter
 * starts from 1.
 */
export async function reserveInvoiceNumbers(
  ownerId: string,
  period: string,
  count: number,
  options: { billingAccountId?: string } = {},
): Promise<string[]> {
  assertValidPeriod(period);
  if (count <= 0) return [];
  await connectToDatabase();

  let prefix = "INV";
  let endSeq: number | undefined;

  if (options.billingAccountId) {
    try {
      const account = await BillingAccount.findOneAndUpdate(
        { _id: options.billingAccountId },
        { $inc: { [`invoiceCounters.${period}`]: count } },
        { new: true, upsert: false },
      )
        .select("invoicePrefix invoiceCounters")
        .lean();

      if (account) {
        prefix = account.invoicePrefix || "INV";
        const counters = account.invoiceCounters as
          | Map<string, number>
          | Record<string, number>
          | undefined;
        endSeq = (counters instanceof Map ? counters.get(period) : counters?.[period]) ?? count;
      }
    } catch {
      // Fall through to legacy owner counter
    }
  }

  if (endSeq === undefined) {
    const user = await User.findOneAndUpdate(
      { _id: ownerId },
      { $inc: { [`invoiceCounters.${period}`]: count } },
      { new: true, upsert: false },
    )
      .select("invoiceCounters")
      .lean();
    endSeq = user?.invoiceCounters?.[period] ?? count;
  }

  // `endSeq` is always set by one of the two branches above; the `?? count`
  // fallback only guards the (unreachable) missing-user edge by treating the
  // counter as starting from 1.
  const lastSeq = endSeq ?? count;
  const numbers: string[] = [];
  for (let seq = lastSeq - count + 1; seq <= lastSeq; seq += 1) {
    numbers.push(formatInvoiceNumber(period, seq, prefix));
  }
  return numbers;
}
