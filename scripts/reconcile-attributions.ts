import { reconcileAttributions } from "@/lib/attribution-reconciliation";
import { connectToDatabase } from "@/lib/mongoose";

async function main() {
  await connectToDatabase();
  console.log("🔍 Running Attribution Reconciliation...\n");

  const report = await reconcileAttributions();

  console.log(`Total Confirmed Attributions: ${report.totalConfirmed}`);
  console.log(`Orphan Attributions: ${report.orphanConfirmedAttributions.length}`);
  console.log(`Duplicate Lease Attributions: ${report.duplicateLeaseAttributions.length}`);
  console.log(`Status: ${report.ok ? "✅ CLEAN" : "⚠️ ISSUES FOUND"}\n`);

  if (!report.ok) {
    if (report.orphanConfirmedAttributions.length > 0) {
      console.log("Orphan Attributions:");
      console.table(report.orphanConfirmedAttributions);
    }
    if (report.duplicateLeaseAttributions.length > 0) {
      console.log("Duplicate Lease Attributions:");
      console.table(report.duplicateLeaseAttributions);
    }
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Reconciliation script failed:", err);
  process.exit(1);
});
