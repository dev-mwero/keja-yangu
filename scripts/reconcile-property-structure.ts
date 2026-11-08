import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config({ path: ".env.local" });

const mongoUri = (() => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing MONGODB_URI");
  return uri;
})();

const softDelete = { deletedAt: { type: Date, default: null } };

const propertySchema = new mongoose.Schema(
  { blocks: { type: Array, default: [] }, ownerId: String, ...softDelete },
  { collection: "properties" },
);
const unitSchema = new mongoose.Schema(
  {
    propertyId: String,
    blockId: String,
    floorId: String,
    name: String,
    letter: String,
    status: String,
    deletedAt: { type: Date, default: null },
    tenantId: { type: [String], default: [] },
  },
  { collection: "units" },
);

async function main() {
  const dryRun = !process.argv.includes("--apply");
  await mongoose.connect(mongoUri, { bufferCommands: false });

  const Property = mongoose.model("ReconcileProperty", propertySchema);
  const Unit = mongoose.model("ReconcileUnit", unitSchema);

  const properties = await Property.find({ deletedAt: null }).lean();
  console.log(`🔍 Scanning ${properties.length} properties (dryRun=${dryRun})...`);

  let totalOrphaned = 0;

  for (const property of properties) {
    const propertyId = String(property._id);
    const blocks = (property.blocks ?? []) as Array<{
      _id: unknown;
      name: string;
      floors?: Array<{ _id: unknown; level: number; unitsPerFloor?: number }>;
    }>;

    const liveUnits = await Unit.find({ propertyId, deletedAt: null }).lean();

    // Expected unit names per block/floor from the structure.
    const expected = new Set<string>();
    for (const block of blocks) {
      const blockId = String(block._id);
      for (const floor of block.floors ?? []) {
        const floorId = String(floor._id);
        const count = floor.unitsPerFloor ?? 0;
        for (let i = 0; i < count; i++) {
          expected.add(`${blockId}:${floorId}:${i}`);
        }
      }
    }

    // Units that exist but whose block/floor no longer exists in the structure.
    const orphaned = liveUnits.filter((unit) => {
      const block = blocks.find((b) => String(b._id) === String(unit.blockId));
      if (!block) return true;
      const floor = (block.floors ?? []).find((f) => String(f._id) === String(unit.floorId));
      return !floor;
    });

    totalOrphaned += orphaned.length;

    if (orphaned.length > 0) {
      console.log(`  Property ${propertyId}: ${orphaned.length} orphaned unit(s)`);
      if (!dryRun) {
        await Unit.updateMany(
          { _id: { $in: orphaned.map((u) => u._id) } },
          { $set: { deletedAt: new Date() } },
        );
      }
    }
  }

  console.log(`\nSummary: ${totalOrphaned} orphaned units found.`);
  if (dryRun) {
    console.log("Dry run — no changes applied. Re-run with --apply to fix.");
  } else {
    console.log("Applied fixes.");
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
