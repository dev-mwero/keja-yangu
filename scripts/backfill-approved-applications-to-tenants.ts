import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config({ path: ".env.local" });

/**
 * Creates the missing `Tenant` record for every approved `Application` that has
 * none. Approving an application now admits the applicant as a tenant, but
 * applications approved before that change left no tenancy behind — so those
 * applicants are invisible in the Tenants list and cannot be assigned a unit.
 *
 * Idempotent: tenants already existing for the same property + email are bound
 * (userId) rather than duplicated. Run with `--dry-run` to preview.
 *
 * Minimal schemas (script independence): app models are not imported so the
 * script runs under tsx without the `@/` path alias.
 */

const applicationSchema = new mongoose.Schema(
  {
    propertyId: { type: String, default: "" },
    ownerId: { type: String, default: "" },
    applicantUserId: { type: String, default: "" },
    applicantName: { type: String, default: "" },
    applicantEmail: { type: String, default: "" },
    status: { type: String, default: "" },
    deletedAt: { type: Date, default: null },
  },
  { collection: "applications" },
);

const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    propertyId: { type: String, default: "" },
    ownerId: { type: String, default: "" },
    status: { type: String, default: "pending" },
    userId: { type: String, default: "" },
    joinedAt: { type: Date },
    deletedAt: { type: Date, default: null },
  },
  { collection: "tenants" },
);

async function main() {
  const dryRun = process.argv.includes("--dry-run");
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

  const Application =
    mongoose.models.Application || mongoose.model("Application", applicationSchema);
  const Tenant = mongoose.models.Tenant || mongoose.model("Tenant", tenantSchema);

  const approved = await Application.find({ status: "approved", deletedAt: null })
    .select("propertyId ownerId applicantUserId applicantName applicantEmail")
    .lean();

  let created = 0;
  let bound = 0;
  let unchanged = 0;

  for (const app of approved) {
    const email = String(app.applicantEmail ?? "")
      .trim()
      .toLowerCase();
    if (!email || !app.propertyId) {
      unchanged += 1;
      continue;
    }

    const existing = await Tenant.findOne({
      propertyId: app.propertyId,
      email,
      deletedAt: null,
    })
      .select("_id userId status")
      .lean();

    if (existing) {
      if (existing.userId !== app.applicantUserId || existing.status !== "active") {
        if (!dryRun) {
          await Tenant.updateOne(
            { _id: existing._id },
            { $set: { userId: app.applicantUserId, status: "active" } },
          );
        }
        bound += 1;
      } else {
        unchanged += 1;
      }
      continue;
    }

    if (!dryRun) {
      await Tenant.create({
        name: app.applicantName,
        email,
        propertyId: app.propertyId,
        ownerId: app.ownerId,
        status: "active",
        userId: app.applicantUserId,
        joinedAt: new Date(),
      });
    }
    created += 1;
  }

  console.log(`${dryRun ? "[dry-run] " : ""}Scanned ${approved.length} approved application(s).`);
  console.log(`Created ${created} tenant record(s).`);
  console.log(`Bound/updated ${bound} existing tenant record(s).`);
  console.log(`Left unchanged ${unchanged}.`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
