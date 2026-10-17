import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config({ path: ".env.local" });

// Minimal schemas (script independence). The app models are intentionally not
// imported so the backfill runs against the shape of the deployed collections.
const userSchema = new mongoose.Schema(
  { email: { type: String, default: "" }, role: { type: String, default: "" } },
  { collection: "users" },
);

const tenantSchema = new mongoose.Schema(
  {
    email: { type: String, default: "" },
    userId: { type: String, default: "" },
    propertyId: { type: String, default: "" },
    deletedAt: { type: Date, default: null },
  },
  { collection: "tenants" },
);

const leaseSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true },
    propertyId: { type: String, default: "" },
    unitId: { type: String, default: "" },
    status: { type: String, default: "active" },
    deletedAt: { type: Date, default: null },
  },
  { collection: "leases" },
);

const unitSchema = new mongoose.Schema(
  {
    propertyId: { type: String, default: "" },
    status: { type: String, default: "available" },
    tenantId: { type: String, default: "" },
    deletedAt: { type: Date, default: null },
  },
  { collection: "units" },
);

function isDryRun(): boolean {
  const flag = process.argv.find((a) => a === "--dry-run" || a === "-n");
  return Boolean(flag);
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("Missing MONGODB_URI environment variable.");
  }

  await mongoose.connect(mongoUri, {
    bufferCommands: false,
    maxPoolSize: 10,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
  });

  const User = mongoose.models.User || mongoose.model("User", userSchema);
  const Tenant = mongoose.models.Tenant || mongoose.model("Tenant", tenantSchema);
  const Lease = mongoose.models.Lease || mongoose.model("Lease", leaseSchema);
  const Unit = mongoose.models.Unit || mongoose.model("Unit", unitSchema);

  const dryRun = isDryRun();

  // Build email->userId map for tenant-role users.
  const users = await User.find({ role: "tenant" }).select("email").lean();
  const userIdByEmail = new Map<string, string>();
  for (const u of users) {
    const email = String(u.email ?? "")
      .trim()
      .toLowerCase();
    if (email) userIdByEmail.set(email, String(u._id));
  }

  // Build tenant doc map by _id for quick lookup.
  const tenants = await Tenant.find({ deletedAt: null })
    .select("_id email userId propertyId")
    .lean();
  const tenantById = new Map(tenants.map((t) => [String(t._id), t]));

  // Build occupied units index: by (propertyId + tenantKey) -> [unit]
  const occupiedUnits = await Unit.find({ deletedAt: null, status: "occupied" })
    .select("_id propertyId tenantId")
    .lean();

  // Map key -> unit list
  const keyToUnits = new Map<string, { _id: string; propertyId: string; tenantId: string }[]>();
  for (const u of occupiedUnits) {
    const pid = String(u.propertyId ?? "");
    const tid = String(u.tenantId ?? "");
    if (!pid) continue;
    // Try to resolve to occupant userId if tid looks like a Tenant _id? Not directly.
    // But occupant is usually userId. We'll also try tenant doc id.
    const keys = new Set<string>();
    if (tid) {
      keys.add(`${pid}:${tid}`);
      // If this tid is a tenant's userId already, also maybe not. But we try both.
    }
    // Also try resolving: scan? small dataset. Instead, when matching leases,
    // we'll check against occupant userId for that tenant.
    for (const k of keys) {
      const list = keyToUnits.get(k) ?? [];
      list.push({ _id: String(u._id), propertyId: pid, tenantId: tid });
      keyToUnits.set(k, list);
    }
  }

  // Find active leases missing unitId (or empty). Also consider all active.
  const leases = await Lease.find({ deletedAt: null, status: "active" })
    .select("_id tenantId propertyId unitId")
    .lean();

  let scanned = 0;
  let updated = 0;
  let conflicts = 0;
  let skippedNoTenant = 0;
  let skippedNoMatch = 0;
  let skippedAlreadySet = 0;

  for (const lease of leases) {
    scanned += 1;
    const leaseId = String(lease._id);
    const tenantId = String(lease.tenantId ?? "");
    const lp = String(lease.propertyId ?? "");
    if (String(lease.unitId ?? "")) {
      skippedAlreadySet += 1;
      continue;
    }
    const t = tenantById.get(tenantId);
    if (!t) {
      skippedNoTenant += 1;
      continue;
    }
    const tp = String(t.propertyId ?? lp);
    // Resolve occupant userId
    let occupantUserId = String(t.userId ?? "");
    if (!occupantUserId) {
      const email = String(t.email ?? "")
        .trim()
        .toLowerCase();
      occupantUserId = userIdByEmail.get(email) ?? "";
    }
    // Find matching occupied unit in this property for occupant
    const candidates: Array<{ _id: string }> = [];
    if (occupantUserId && tp) {
      const k1 = `${tp}:${occupantUserId}`;
      const list1 = keyToUnits.get(k1) ?? [];
      for (const u of list1) candidates.push({ _id: u._id });
    }
    if (candidates.length === 0 && tp) {
      // fallback: tenant doc id
      const k2 = `${tp}:${tenantId}`;
      const list2 = keyToUnits.get(k2) ?? [];
      for (const u of list2) candidates.push({ _id: u._id });
    }
    // Deduplicate by id
    const uniq = Array.from(new Map(candidates.map((c) => [c._id, c])).values());
    if (uniq.length === 1) {
      if (dryRun) {
        updated += 1;
      } else {
        await Lease.updateOne({ _id: leaseId }, { $set: { unitId: uniq[0]._id } });
        updated += 1;
      }
      continue;
    }
    if (uniq.length > 1) {
      conflicts += 1;
      continue;
    }
    skippedNoMatch += 1;
  }

  console.log(`Scanned ${scanned} active lease(s).`);
  console.log(`${skippedAlreadySet} already had unitId set.`);
  console.log(`${skippedNoTenant} skipped (tenant not found).`);
  console.log(`${skippedNoMatch} skipped (no matching occupied unit found).`);
  console.log(`${conflicts} conflict(s) (>1 occupied unit matched).`);
  console.log(`${dryRun ? "(DRY RUN) Would update" : "Updated"} ${updated} lease(s).`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
