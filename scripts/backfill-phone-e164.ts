import dotenv from "dotenv";
import mongoose from "mongoose";
import { isValidE164, normalizeStoredPhone } from "../src/lib/phone";

dotenv.config({ path: ".env.local" });

// Minimal schema (script independence): the app model is intentionally not
// imported so the backfill runs against the shape of the deployed collection.
const userSchema = new mongoose.Schema(
  { phone: { type: String, default: "" }, whatsapp: { type: String, default: "" } },
  { collection: "users" },
);

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

  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  const cursor = User.find({
    $or: [{ phone: { $nin: ["", null] } }, { whatsapp: { $nin: ["", null] } }],
  })
    .select("phone whatsapp")
    .lean()
    .cursor();

  for await (const doc of cursor) {
    scanned += 1;
    const record = doc as { _id: unknown; phone?: string; whatsapp?: string };
    const set: Record<string, string> = {};

    const phone = record.phone?.trim() ?? "";
    if (phone) {
      const normalized = normalizeStoredPhone(phone);
      if (isValidE164(normalized)) {
        if (normalized !== record.phone) set.phone = normalized;
      } else {
        skipped += 1;
        console.warn(
          `  skipped unparseable phone "${record.phone}" for user ${String(record._id)}`,
        );
      }
    }

    const whatsapp = record.whatsapp?.trim() ?? "";
    if (whatsapp) {
      const normalized = normalizeStoredPhone(whatsapp);
      if (isValidE164(normalized)) {
        if (normalized !== record.whatsapp) set.whatsapp = normalized;
      } else {
        skipped += 1;
      }
    }

    if (Object.keys(set).length > 0) {
      await User.updateOne({ _id: record._id }, { $set: set });
      updated += 1;
    }
  }

  console.log(
    `Phone backfill: ${scanned} scanned, ${updated} updated to E.164, ${skipped} values skipped.`,
  );
}

main()
  .then(async () => {
    await mongoose.disconnect();
    console.log("Backfill complete.");
    process.exit(0);
  })
  .catch(async (error) => {
    await mongoose.disconnect();
    console.error("Backfill failed:", error);
    process.exit(1);
  });
