import dotenv from "dotenv";
import { reconcileCommissions } from "@/lib/commission";
import { connectToDatabase } from "@/lib/mongoose";

dotenv.config({ path: ".env.local" });

async function main() {
  await connectToDatabase();
  console.log("🔍 Running Commission Reconciliation...\n");

  const report = await reconcileCommissions();

  console.log(`Paid accruals: ${report.totalPaid}`);
  console.log(`Paid without payout batch: ${report.paidWithoutBatch.length}`);
  console.log(`Paid but batch not paid: ${report.paidButBatchNotPaid.length}`);
  console.log(`Duplicate accruals: ${report.duplicateAccruals.length}`);
  console.log(`Status: ${report.ok ? "✅ CLEAN" : "⚠️ ISSUES FOUND"}\n`);

  if (!report.ok) {
    if (report.paidWithoutBatch.length > 0) {
      console.table(report.paidWithoutBatch);
    }
    if (report.paidButBatchNotPaid.length > 0) {
      console.table(report.paidButBatchNotPaid);
    }
    if (report.duplicateAccruals.length > 0) {
      console.table(report.duplicateAccruals);
    }
    process.exit(1);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error("Commission reconciliation failed:", error);
  process.exit(1);
});
