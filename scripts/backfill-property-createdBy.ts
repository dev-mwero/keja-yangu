import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config({ path: ".env.local" });

// Minimal schemas (script independence): the app models are intentionally not
// imported so the backfill runs against the shape of the deployed collection.
const userSchema = new mongoose.Schema(
  {
    role: String,
    privileges: { type: [String], default: [] },
    managedByOwnerId: { type: String, default: "" },
  },
  { collection: "users" },
);

const propertySchema = new mongoose.Schema(
  { ownerId: String, createdById: String },
  { collection: "properties" },
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
  const Property = mongoose.models.Property || mongoose.model("Property", propertySchema);

  const userResult = await User.updateMany(
    { role: "caretaker", managedByOwnerId: { $exists: false } },
    { $set: { managedByOwnerId: "", privileges: [] } },
  );
  console.log(
    `Users (caretakers): ${userResult.matchedCount} matched, ${userResult.modifiedCount} updated — set managedByOwnerId="" and privileges=[]`,
  );

  const propertyResult = await Property.updateMany({ createdById: { $exists: false } }, [
    { $set: { createdById: "$ownerId" } },
  ]);
  console.log(
    `Properties: ${propertyResult.matchedCount} matched, ${propertyResult.modifiedCount} updated — set createdById=ownerId`,
  );
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
