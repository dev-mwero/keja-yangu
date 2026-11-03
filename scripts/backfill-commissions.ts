import { accrueCommissionForSettledInvoice } from "@/lib/commission";
import { connectToDatabase } from "@/lib/mongoose";
import { Invoice } from "@/models/Invoice";

async function main() {
  const apply = process.argv.includes("--apply");

  await connectToDatabase();
  console.log(
    apply
      ? "🧾 Backfilling shadow commission accruals (no payouts)...\n"
      : "🔍 Commission backfill dry-run — no writes. Pass --apply to create shadow accruals.\n",
  );

  const invoices = (await Invoice.find({
    status: "paid",
    leaseId: { $ne: "" },
    rentAmount: { $gt: 0 },
  })
    .select("_id leaseId rentAmount amountPaid")
    .lean()) as Array<{
    _id: unknown;
    leaseId?: string;
    rentAmount?: number;
    amountPaid?: number;
  }>;

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const invoice of invoices) {
    if (!apply) {
      skipped += 1;
      continue;
    }

    try {
      const accrual = await accrueCommissionForSettledInvoice(invoice);
      if (accrual) created += 1;
      else skipped += 1;
    } catch (error) {
      failed += 1;
      console.error(`[commission] backfill failed invoice=${String(invoice._id)}`, error);
    }
  }

  console.log(`Paid rent invoices scanned: ${invoices.length}`);
  if (apply) {
    console.log(`Accruals created: ${created}`);
    console.log(`Skipped (no attribution/agreement/zero basis): ${skipped}`);
    console.log(`Failed: ${failed}`);
  } else {
    console.log(`Candidate invoices: ${invoices.length}`);
    console.log("Payout execution stays disabled; --apply only creates shadow accruals.");
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Commission backfill failed:", error);
  process.exit(1);
});
