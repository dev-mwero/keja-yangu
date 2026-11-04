import { auditLegacyReadiness } from "@/lib/legacy-readiness";
import { connectToDatabase } from "@/lib/mongoose";

async function main() {
  await connectToDatabase();
  console.log("🔍 Phase 9 legacy readiness audit (read-only)...\n");

  const report = await auditLegacyReadiness();

  console.log("Counts:");
  console.table(report.counts);
  console.log(
    `Status: ${report.readyForLegacyRetirement ? "✅ READY" : "⚠️ LEGACY RETIREMENT BLOCKED"}\n`,
  );

  const blocking = Object.entries(report.blocking).filter(([, rows]) => rows.length > 0);
  if (blocking.length === 0) {
    console.log("No blocking drift found.");
    process.exit(0);
  }

  for (const [name, rows] of blocking) {
    console.log(`${name} (${rows.length}):`);
    console.table(rows);
  }

  process.exit(1);
}

main().catch((error) => {
  console.error("Phase 9 readiness audit failed:", error);
  process.exit(1);
});
