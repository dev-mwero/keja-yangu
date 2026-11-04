import dotenv from "dotenv";
import mongoose from "mongoose";
import { planListingBackfill } from "../src/lib/listing-backfill.ts";

dotenv.config({ path: ".env.local" });

const unitSchema = new mongoose.Schema(
  {
    propertyId: String,
    blockId: String,
    name: String,
    rent: Number,
    serviceCharge: Number,
    beds: Number,
    baths: Number,
    status: String,
    tenantId: [String],
    billingAccountId: String,
    deletedAt: Date,
  },
  { collection: "units" },
);

const propertySchema = new mongoose.Schema(
  {
    title: String,
    price: Number,
    images: [String],
    amenities: [String],
    ownerId: String,
    deletedAt: Date,
  },
  { collection: "properties" },
);

const listingSchema = new mongoose.Schema(
  {
    propertyId: String,
    blockId: String,
    unitId: String,
    state: String,
    headline: String,
    description: String,
    askingRent: Number,
    serviceCharge: Number,
    depositMonths: Number,
    availableFrom: Date,
    minimumStayMonths: Number,
    amenities: [String],
    media: [
      {
        url: String,
        key: String,
        caption: String,
        isPrimary: Boolean,
      },
    ],
    visibility: String,
    canonicalPublisherUserId: String,
    verifiedByUserId: String,
    verifiedAt: Date,
    publishedAt: Date,
    expiresAt: Date,
    version: { type: Number, default: 1 },
    createdByUserId: String,
    deletedAt: Date,
  },
  { collection: "listings", timestamps: true },
);

const leaseSchema = new mongoose.Schema(
  {
    unitId: String,
    status: String,
  },
  { collection: "leases" },
);

const auditEventSchema = new mongoose.Schema(
  {
    actorUserId: String,
    actorRole: String,
    action: String,
    entityType: String,
    entityId: String,
    scope: {
      propertyId: String,
      blockId: String,
      unitId: String,
    },
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "auditevents", versionKey: false },
);

async function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes("--apply");
  const isDryRun = !isApply || args.includes("--dry-run");

  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/keja-yangu?replicaSet=rs0";

  console.log(`Connecting to MongoDB at ${mongoUri}...`);
  await mongoose.connect(mongoUri);

  const Unit = mongoose.model("BackfillUnit", unitSchema);
  const Property = mongoose.model("BackfillProperty", propertySchema);
  const Listing = mongoose.model("BackfillListing", listingSchema);
  const Lease = mongoose.model("BackfillLease", leaseSchema);
  const AuditEvent = mongoose.model("BackfillAuditEvent", auditEventSchema);

  const [units, properties, existingListings, activeLeases] = await Promise.all([
    Unit.find({ deletedAt: null }).lean(),
    Property.find({ deletedAt: null }).lean(),
    Listing.find({ deletedAt: null }).lean(),
    Lease.find({ status: "active" }).lean(),
  ]);

  console.log(
    `Loaded: ${units.length} units, ${properties.length} properties, ${existingListings.length} existing listings, ${activeLeases.length} active leases.`,
  );

  const plan = planListingBackfill({
    units: units.map((u) => ({
      _id: String(u._id),
      propertyId: String(u.propertyId),
      blockId: u.blockId ? String(u.blockId) : undefined,
      name: String(u.name),
      rent: u.rent as number | null | undefined,
      serviceCharge: u.serviceCharge as number | undefined,
      beds: u.beds as number | undefined,
      baths: u.baths as number | undefined,
      status: String(u.status),
      tenantId: (u.tenantId as string[]) || [],
      billingAccountId: u.billingAccountId as string | undefined,
    })),
    properties: properties.map((p) => ({
      _id: String(p._id),
      title: String(p.title),
      price: p.price as number | undefined,
      images: (p.images as string[]) || [],
      amenities: (p.amenities as string[]) || [],
      ownerId: p.ownerId as string | undefined,
    })),
    existingListings: existingListings.map((l) => ({
      unitId: String(l.unitId),
      state: String(l.state),
    })),
    activeLeases: activeLeases.map((l) => ({
      unitId: String(l.unitId),
      status: String(l.status),
    })),
    canonicalPublisherUserId: "system-backfill",
  });

  console.log("\n--- BACKFILL PLAN ---");
  console.log(`Planned Draft Listings: ${plan.plannedListings.length}`);
  console.log(`Skipped Units: ${plan.skippedUnits.length}`);
  console.log(`Warnings: ${plan.warnings.length}`);

  if (plan.warnings.length > 0) {
    console.log("\nWarnings:");
    for (const w of plan.warnings.slice(0, 10)) {
      console.log(` - ${w}`);
    }
  }

  if (isDryRun) {
    console.log("\nDRY RUN complete. No changes written. Use --apply to create draft listings.");
  } else {
    console.log("\nAPPLYING CHANGES...");
    if (plan.plannedListings.length > 0) {
      const created = await Listing.insertMany(plan.plannedListings);
      console.log(`Inserted ${created.length} draft listings.`);

      const auditRecords = created.map((listing) => ({
        actorUserId: "system-backfill",
        actorRole: "system",
        action: "listing.backfill_created",
        entityType: "listing",
        entityId: String(listing._id),
        scope: {
          propertyId: listing.propertyId,
          blockId: listing.blockId,
          unitId: listing.unitId,
        },
        before: null,
        after: {
          state: listing.state,
          headline: listing.headline,
          askingRent: listing.askingRent,
        },
      }));

      await AuditEvent.insertMany(auditRecords);
      console.log(`Logged ${auditRecords.length} audit events.`);
    }
    console.log("Backfill completed successfully.");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
