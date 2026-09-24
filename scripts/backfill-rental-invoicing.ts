import dotenv from "dotenv";
import mongoose from "mongoose";
import { generateForPeriod } from "@/lib/invoice-generation";
import { currentPeriod } from "@/lib/invoicing";

dotenv.config({ path: ".env.local" });

// Minimal schemas (script independence): the app models are intentionally not
// imported so the backfill runs against the shape of the deployed collection.
const userSchema = new mongoose.Schema(
  {
    email: String,
    role: String,
    invoiceCounters: { type: mongoose.Schema.Types.Map, of: Number },
  },
  { collection: "users" },
);

const tenantSchema = new mongoose.Schema(
  { email: String, userId: String },
  { collection: "tenants" },
);

const leaseSchema = new mongoose.Schema(
  {
    tenantId: String,
    propertyId: String,
    ownerId: String,
    rentAmount: Number,
    frequency: String,
    startDate: Date,
    endDate: Date,
    status: String,
  },
  { collection: "leases" },
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: String,
    tenantId: String,
    propertyId: String,
    leaseId: String,
    ownerId: String,
    period: String,
    amountDue: Number,
    amountPaid: Number,
    status: String,
    dueDate: Date,
    issuedAt: Date,
  },
  { collection: "invoices" },
);

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
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
  const Invoice = mongoose.models.Invoice || mongoose.model("Invoice", invoiceSchema);

  // (a) Bind tenant-role users to unbound Tenant rows by email.
  const tenantUsers = await User.find({ role: "tenant" }).select("email").lean();

  let tenantsMatched = 0;
  let tenantsBound = 0;
  let skippedAlreadyBound = 0;

  for (const tenantUser of tenantUsers) {
    const email = tenantUser.email.trim().toLowerCase();
    const userId = String(tenantUser._id);
    skippedAlreadyBound += await Tenant.countDocuments({ email, userId: { $ne: "" } });
    const result = await Tenant.updateMany({ email, userId: "" }, { $set: { userId } });
    tenantsMatched += result.matchedCount;
    tenantsBound += result.modifiedCount;
  }

  console.log(
    `Tenants: ${tenantUsers.length} tenant users, ${tenantsMatched} matched, ${tenantsBound} bound, ${skippedAlreadyBound} skipped (already bound)`,
  );

  // (b) Optional --generate: create invoices for all active leases this period.
  let created = 0;
  let skipped = 0;

  if (process.argv.includes("--generate")) {
    const period = currentPeriod();
    const now = new Date();
    const leases = await Lease.find({ status: "active" }).lean();

    const existing = await Invoice.find({
      leaseId: { $in: leases.map((lease) => String(lease._id)) },
      period,
    })
      .select("leaseId")
      .lean();
    const existingByLeaseId = new Set(existing.map((invoice) => invoice.leaseId));

    for (const lease of leases) {
      const leaseId = String(lease._id);
      if (existingByLeaseId.has(leaseId)) {
        skipped++;
        continue;
      }
      const draft = generateForPeriod({
        leases: [lease],
        existing: [],
        period,
        now,
      }).toCreate[0];
      if (!draft) {
        skipped++;
        continue;
      }
      // Mirrors src/lib/invoice-numbering.ts: atomic per-owner counter.
      const user = await User.findOneAndUpdate(
        { _id: lease.ownerId },
        { $inc: { [`invoiceCounters.${period}`]: 1 } },
        { new: true, upsert: false },
      )
        .select("invoiceCounters")
        .lean();
      const seq = user?.invoiceCounters?.[period] ?? 1;
      draft.invoiceNumber = `INV-${period.replace("-", "")}-${String(seq).padStart(4, "0")}`;
      try {
        await Invoice.create(draft);
        created++;
        console.log(
          `Created ${draft.invoiceNumber} (owner ${lease.ownerId}, lease ${leaseId}, period ${period})`,
        );
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          skipped++;
          continue;
        }
        throw error;
      }
    }

    console.log(`Invoices: ${created} created, ${skipped} skipped for period ${period}`);
  }

  console.log(`Backfill complete: ${tenantsBound} bound, ${created} created, ${skipped} skipped.`);
}

main()
  .then(async () => {
    await mongoose.disconnect();
    console.log("Backfill complete.");
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Backfill failed:", error);
    await mongoose.disconnect();
    process.exit(1);
  });
