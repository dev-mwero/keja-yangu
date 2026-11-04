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
