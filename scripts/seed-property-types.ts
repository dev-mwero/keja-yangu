import dotenv from "dotenv";
import mongoose from "mongoose";
import { SEED_PROPERTY_TYPES } from "../src/lib/property-types";

dotenv.config({ path: ".env.local" });

// Script independence: define the collection shape locally so the seed runs
// against the deployed collection without importing app models.
const propertyTypeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, lowercase: true },
    label: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);

  const PropertyType =
    mongoose.models.PropertyType || mongoose.model("PropertyType", propertyTypeSchema);

  let upserted = 0;
  for (const type of SEED_PROPERTY_TYPES) {
    const result = await PropertyType.updateOne(
      { key: type.key },
      { $setOnInsert: { key: type.key, label: type.label, order: type.order, active: true } },
      { upsert: true },
    );
    if (result.upsertedCount > 0) upserted += 1;
  }

  const total = await PropertyType.countDocuments({ deletedAt: null });
  console.log(`Seed complete: ${upserted} inserted, ${total} property types total.`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Seed failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});
