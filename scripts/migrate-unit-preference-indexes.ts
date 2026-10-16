import dotenv from "dotenv";
import mongoose, { Schema } from "mongoose";

dotenv.config({ path: ".env.local" });

/**
 * Creates the indexes for the `unitpreferences` collection introduced with the
 * tenant unit-preference feature.
 *
 * The app relies on Mongoose autoIndex, which builds indexes lazily when a model
 * first connects. In serverless/production that is not guaranteed, and the
 * `{ userId, propertyId }` partial unique index is a correctness guarantee (one
 * live preference per tenant per property) — so this script builds the index
 * set explicitly. Run with `--dry-run` to preview without writing.
 *
 * The schema is declared locally (the app model is not imported) to keep the
 * script runnable under tsx without the `@/` path alias, and mirrors the index
 * set of the app model so `syncIndexes()` does not drop unrelated indexes.
 */

const field = { deletedAt: { type: Date, default: null } };

const unitPreferenceSchema = new Schema(
  {
    userId: String,
    propertyId: String,
    ownerId: String,
    unitId: String,
    blockId: String,
    blockName: String,
    floorId: String,
    floorLabel: String,
    note: String,
    ...field,
  },
  { collection: "unitpreferences" },
);

unitPreferenceSchema.index({ unitId: 1 });
unitPreferenceSchema.index({ ownerId: 1 });
unitPreferenceSchema.index(
  { userId: 1, propertyId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

async function existingIndexNames(model: mongoose.Model<unknown>): Promise<string[]> {
  try {
    return (await model.collection.indexes())
      .map((ix) => ix.name)
      .filter((name): name is string => Boolean(name));
  } catch (error) {
    // NamespaceNotFound: collection does not exist yet (nothing written).
    if ((error as { code?: number }).code === 26) return [];
    throw error;
  }
}

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

  const Model =
    mongoose.models.UnitPreference ?? mongoose.model("UnitPreference", unitPreferenceSchema);

  const before = await existingIndexNames(Model);
  const { toCreate, toDrop } = await Model.diffIndexes();
  const names = (specs: unknown[]) =>
    specs.map((spec) => (spec as { name?: string }).name ?? JSON.stringify(spec));

  if (dryRun) {
    console.log(`unitpreferences: existing indexes: ${before.join(", ") || "(none)"}`);
    if (toCreate.length > 0) console.log(`  would create: ${names(toCreate).join(", ")}`);
    if (toDrop.length > 0) console.log(`  would drop:   ${toDrop.join(", ")}`);
    await mongoose.disconnect();
    console.log("Dry run complete (no changes written).");
    return;
  }

  await Model.syncIndexes();

  const after = await existingIndexNames(Model);
  console.log(`unitpreferences: indexes now: ${after.join(", ")}`);

  await mongoose.disconnect();
  console.log("Migration complete.");
}

main().catch(async (error) => {
  console.error("Unit-preference index migration failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});
