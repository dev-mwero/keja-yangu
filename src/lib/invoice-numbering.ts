import { assertValidPeriod } from "@/lib/invoicing";
import { connectToDatabase } from "@/lib/mongoose";
import { User } from "@/models/User";

/**
 * Formats a sequence number into `INV-YYYYMM-NNNN`, zero-padded to at least
 * four digits (grows past 9999 without capping).
 */
export function formatInvoiceNumber(period: string, seq: number): string {
  assertValidPeriod(period);
  return `INV-${period.replace("-", "")}-${String(seq).padStart(4, "0")}`;
}

/**
 * Atomically reserves the next invoice number for an owner within a period by
 * incrementing `User.invoiceCounters.<period>`. The unique `invoiceNumber`
 * index on Invoice is the duplicate backstop; insert-time retry after an E11000
 * needs the insert site (the generate/manual-create routes) so this helper only
 * owns the counter increment and never touches the Invoice collection.
 */
export async function nextInvoiceNumber(ownerId: string, period: string): Promise<string> {
  assertValidPeriod(period);
  await connectToDatabase();
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
