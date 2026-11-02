import dotenv from "dotenv";
import mongoose from "mongoose";
import { type PropertyDoc, planBlockBackfill, type UnitDoc } from "../src/lib/block-backfill.ts";

dotenv.config({ path: ".env.local" });

const propertySchema = new mongoose.Schema(
  {
    title: String,
    blocks: [
      {
        name: String,
        order: Number,
        rentOverride: { type: Number, default: null },
        purpose: { type: String, default: null },
      },
    ],
    deletedAt: { type: Date, default: null },
  },
  { collection: "properties" },
);

const unitSchema = new mongoose.Schema(
  {
    propertyId: String,
    blockId: String,
    blockName: String,
    name: String,
    deletedAt: { type: Date, default: null },
  },
  { collection: "units" },
);

const blockSchema = new mongoose.Schema(
  {
    propertyId: { type: String, required: true },
    name: { type: String, required: true },
    order: { type: Number, default: 0 },
    rentOverride: { type: Number, default: null },
    purpose: { type: String, default: null },
    legacyEmbeddedId: { type: String, default: "" },
    deletedAt: { type: Date, default: null },
  },
  { collection: "blocks", timestamps: true },
);

blockSchema.index({ propertyId: 1, deletedAt: 1 });
blockSchema.index({ legacyEmbeddedId: 1 }, { sparse: true });

async function main() {
  const apply = process.argv.includes("--apply");
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("MONGODB_URI is not set in environment or .env.local");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);

  const Property =
    mongoose.models.BackfillProperty || mongoose.model("BackfillProperty", propertySchema);
  const Unit = mongoose.models.BackfillUnit || mongoose.model("BackfillUnit", unitSchema);
  const Block = mongoose.models.BackfillBlock || mongoose.model("BackfillBlock", blockSchema);

  const properties = (await Property.find({ deletedAt: null }).lean()) as unknown as PropertyDoc[];
  const units = (await Unit.find({ deletedAt: null }).lean()) as unknown as UnitDoc[];

  const { blocks, mismatches } = planBlockBackfill(properties, units);

  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN (pass --apply to write)"}`);
  console.log(`Live properties scanned: ${properties.length}`);
  console.log(`Live units scanned: ${units.length}`);
  console.log(`Blocks planned for sync: ${blocks.length}`);
  console.log(`Mismatches / orphan units detected: ${mismatches.length}`);

  if (mismatches.length > 0) {
    console.warn("Mismatches found:");
    for (const m of mismatches.slice(0, 10)) {
      console.warn(`  - Unit ${m.unitName} (${m.unitId}): ${m.issue}`);
    }
    if (mismatches.length > 10) {
      console.warn(`  ... and ${mismatches.length - 10} more`);
    }
  }

  if (!apply) {
    console.log("No writes performed. Re-run with --apply after reviewing the plan.");
    return;
  }

  let upserted = 0;
  let updated = 0;

  for (const block of blocks) {
    const res = await Block.updateOne(
      { propertyId: block.propertyId, legacyEmbeddedId: block.legacyEmbeddedId },
      {
        $set: {
          name: block.name,
          order: block.order,
          rentOverride: block.rentOverride,
          purpose: block.purpose,
          deletedAt: null,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount > 0) upserted++;
    else updated++;
  }

  console.log(`Blocks upserted (new): ${upserted}`);
  console.log(`Blocks updated (existing): ${updated}`);
}

main()
  .then(async () => {
    await mongoose.disconnect();
    console.log("Block backfill complete.");
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Block backfill failed:", error);
    await mongoose.disconnect();
    process.exit(1);
  });
