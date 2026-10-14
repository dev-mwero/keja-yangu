import dotenv from "dotenv";
import mongoose, { Schema } from "mongoose";

dotenv.config({ path: ".env.local" });

/**
 * One-off migration for app-wide soft delete.
 *
 * 1. Backfills `deletedAt: null` on existing rows (the plugin's default read
 *    filter matches both `null` and missing, so this is for cleanliness and so
 *    the new partial indexes definitely cover pre-existing rows).
 * 2. Rebuilds each collection's indexes to match the app models — replacing the
 *    old unconditional unique indexes with `deletedAt: null`-filtered partial
 *    unique indexes so a soft-deleted record no longer blocks recreating its key.
 *
 * Schemas are declared locally (the app models are not imported) to keep the
 * script runnable under tsx without the `@/` path alias, and they mirror the
 * full index set of the corresponding app models so `syncIndexes()` does not
 * drop unrelated indexes.
 */

const field = { deletedAt: { type: Date, default: null } };

const propertySchema = new Schema(
  { status: String, published: Boolean, ...field },
  { collection: "properties" },
);
propertySchema.index({ status: 1, published: 1 });

const unitSchema = new Schema(
  {
    propertyId: String,
    ownerId: String,
    blockId: String,
    name: String,
    status: String,
    floorLevel: Number,
    ...field,
  },
  { collection: "units" },
);
unitSchema.index(
  { blockId: 1, name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
unitSchema.index({ propertyId: 1, status: 1 });
unitSchema.index({ ownerId: 1, status: 1 });
unitSchema.index({ blockId: 1, floorLevel: 1 });

const tenantSchema = new Schema(
  { propertyId: String, email: String, userId: String, ...field },
  { collection: "tenants" },
);
tenantSchema.index(
  { propertyId: 1, email: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
tenantSchema.index({ userId: 1 });

const leaseSchema = new Schema(
  { tenantId: String, status: String, ownerId: String, propertyId: String, ...field },
  { collection: "leases" },
);
leaseSchema.index({ ownerId: 1 });
leaseSchema.index({ tenantId: 1 });
leaseSchema.index({ propertyId: 1 });
leaseSchema.index(
  { tenantId: 1 },
  {
    unique: true,
    name: "lease_active_tenant_unique",
    partialFilterExpression: { status: "active", deletedAt: null },
  },
);

const invoiceSchema = new Schema(
  {
    invoiceNumber: String,
    ownerId: String,
    period: String,
    tenantId: String,
    leaseId: String,
    ...field,
  },
  { collection: "invoices" },
);
invoiceSchema.index({ ownerId: 1, period: 1 });
invoiceSchema.index({ tenantId: 1 });
invoiceSchema.index(
  { invoiceNumber: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
invoiceSchema.index(
  { leaseId: 1, period: 1 },
  { unique: true, partialFilterExpression: { leaseId: { $gt: "" }, deletedAt: null } },
);

const propertyTypeSchema = new Schema(
  { key: String, label: String, order: Number, active: Boolean, ...field },
  { collection: "propertytypes" },
);
propertyTypeSchema.index({ active: 1, order: 1 });
propertyTypeSchema.index(
  { key: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

const schemas: Array<[string, Schema]> = [
  ["Property", propertySchema],
  ["Unit", unitSchema],
  ["Tenant", tenantSchema],
  ["Lease", leaseSchema],
  ["Invoice", invoiceSchema],
  ["PropertyType", propertyTypeSchema],
];

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("Missing MONGODB_URI environment variable.");
  }

  const dryRun = process.argv.includes("--dry-run");

  await mongoose.connect(mongoUri, {
    bufferCommands: false,
    maxPoolSize: 10,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
  });

  for (const [name, schema] of schemas) {
    const Model = mongoose.models[name] || mongoose.model(name, schema);

    const pendingBackfill = await Model.countDocuments({ deletedAt: { $exists: false } });
    const before = (await Model.collection.indexes()).map((ix) => ix.name);
    const { toCreate, toDrop } = await Model.diffIndexes();
    const names = (specs: unknown[]) =>
      specs.map((spec) => (spec as { name?: string }).name ?? JSON.stringify(spec));

    if (dryRun) {
      console.log(
        `${name}: ${pendingBackfill} row(s) need deletedAt backfill; ` +
          `create ${toCreate.length}, drop ${toDrop.length}`,
      );
      console.log(`  existing: ${before.join(", ")}`);
      if (toCreate.length > 0) console.log(`  would create: ${names(toCreate).join(", ")}`);
      if (toDrop.length > 0) console.log(`  would drop:   ${toDrop.join(", ")}`);
      continue;
    }

    const backfill = await Model.updateMany(
      { deletedAt: { $exists: false } },
      { $set: { deletedAt: null } },
    );

    await Model.syncIndexes();

    const after = (await Model.collection.indexes()).map((ix) => ix.name);
    console.log(
      `${name}: backfilled ${backfill.modifiedCount} row(s); ` + `indexes now: ${after.join(", ")}`,
    );
  }

  await mongoose.disconnect();
  console.log(dryRun ? "Dry run complete (no changes written)." : "Migration complete.");
}

main().catch(async (error) => {
  console.error("Soft-delete index migration failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});
