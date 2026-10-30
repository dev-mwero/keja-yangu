import dotenv from "dotenv";
import mongoose from "mongoose";
import { isValidE164, normalizeStoredPhone } from "../src/lib/phone";

dotenv.config({ path: ".env.local" });

const userSchema = new mongoose.Schema(
  {
    phone: { type: String, default: "" },
    role: String,
    isActive: Boolean,
  },
  { collection: "users" },
);

interface UserRecord {
  _id: unknown;
  phone?: string;
  role?: string;
  isActive?: boolean;
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

  const User = mongoose.models.User || mongoose.model("User", userSchema);

  let scanned = 0;
  let updated = 0;
  let cleared = 0;
  let invalid = 0;

  const cursor = User.find({ phone: { $nin: ["", null] } })
    .select("phone role isActive")
    .lean()
    .cursor();

  for await (const doc of cursor) {
    scanned += 1;
    const record = doc as UserRecord;
    const phone = record.phone?.trim() ?? "";
    if (!phone) continue;

    const normalized = normalizeStoredPhone(phone);
    if (!isValidE164(normalized)) {
      invalid += 1;
      console.warn(`  invalid phone "${record.phone}" on user ${String(record._id)}`);
      continue;
    }
    if (normalized !== record.phone) {
      if (!dryRun) {
        await User.updateOne({ _id: record._id }, { $set: { phone: normalized } });
      }
      updated += 1;
    }
  }

  const emptyPhones = await User.countDocuments({ phone: "" });
  if (emptyPhones > 0) {
    if (!dryRun) {
      await User.updateMany({ phone: "" }, { $unset: { phone: "" } });
    }
    cleared = emptyPhones;
  }

  const duplicates = await User.aggregate<{
    _id: string;
    count: number;
    roles: string[];
  }>([
    { $match: { phone: { $nin: ["", null] } } },
    {
      $group: {
        _id: "$phone",
        count: { $sum: 1 },
        roles: { $addToSet: "$role" },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
  ]);

  console.log(
    `${dryRun ? "[dry-run] " : ""}Phone identity migration: ` +
      `${scanned} scanned, ${updated} normalized, ${cleared} empty values cleared, ` +
      `${invalid} invalid left untouched, ${duplicates.length} duplicate phone value(s).`,
  );

  if (duplicates.length > 0) {
    console.warn("Duplicate phones must be resolved manually before adding the unique index:");
    for (const duplicate of duplicates) {
      console.warn(`  ${duplicate._id}: ${duplicate.count} users (${duplicate.roles.join(", ")})`);
    }
    process.exitCode = 2;
  }
}

main()
  .then(async () => {
    await mongoose.disconnect();
    console.log("Phone identity migration complete.");
  })
  .catch(async (error) => {
    await mongoose.disconnect();
    console.error("Phone identity migration failed:", error);
    process.exit(1);
  });
