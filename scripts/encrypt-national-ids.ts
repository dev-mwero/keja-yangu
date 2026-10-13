import dotenv from "dotenv";
import mongoose from "mongoose";
import { encryptField, isEncrypted } from "../src/lib/crypto";

dotenv.config({ path: ".env.local" });

// Minimal schema (script independence): the app model is intentionally not
// imported so the backfill runs against the shape of the deployed collection.
const userSchema = new mongoose.Schema(
  { nationalId: { type: String, default: "" } },
  { collection: "users" },
);

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("Missing MONGODB_URI environment variable.");
  }
  if (!process.env.FIELD_ENCRYPTION_KEY) {
    throw new Error("Missing FIELD_ENCRYPTION_KEY environment variable.");
  }

  await mongoose.connect(mongoUri, {
    bufferCommands: false,
    maxPoolSize: 10,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
  });

  const User = mongoose.models.User || mongoose.model("User", userSchema);

  let scanned = 0;
  let encrypted = 0;

  const cursor = User.find({ nationalId: { $nin: ["", null] } })
    .select("nationalId")
    .lean()
    .cursor();

  for await (const doc of cursor) {
    scanned += 1;
    const value = typeof doc.nationalId === "string" ? doc.nationalId : "";
    if (!value || isEncrypted(value)) continue;
    await User.updateOne({ _id: doc._id }, { $set: { nationalId: encryptField(value) } });
    encrypted += 1;
  }

  console.log(`nationalId backfill: scanned ${scanned}, encrypted ${encrypted}.`);
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
