import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config({ path: ".env.local" });

// Minimal schemas (script independence): the app models are intentionally not
// imported so the backfill runs against the shape of the deployed collections.
const userSchema = new mongoose.Schema(
  { email: { type: String, default: "" }, role: { type: String, default: "" } },
  { collection: "users" },
);

const tenantSchema = new mongoose.Schema(
  {
    email: { type: String, default: "" },
    userId: { type: String, default: "" },
    deletedAt: { type: Date, default: null },
  },
  { collection: "tenants" },
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
  const Tenant = mongoose.models.Tenant || mongoose.model("Tenant", tenantSchema);

  // Map lowercased email -> verified tenant-role user id.
  const users = await User.find({ role: "tenant" }).select("email").lean();
  const userIdByEmail = new Map<string, string>();
  for (const u of users) {
    const email = String(u.email ?? "")
      .trim()
      .toLowerCase();
    if (email) userIdByEmail.set(email, String(u._id));
  }

  let scanned = 0;
  let linked = 0;
  let skipped = 0;

  const cursor = Tenant.find({ deletedAt: null, $or: [{ userId: "" }, { userId: null }] })
    .select("email userId")
    .lean()
    .cursor();

  for await (const doc of cursor) {
    scanned += 1;
    const email = String(doc.email ?? "")
      .trim()
      .toLowerCase();
    const userId = userIdByEmail.get(email);
    if (!userId) {
      skipped += 1;
      continue;
    }
    await Tenant.updateOne({ _id: doc._id }, { $set: { userId } });
    linked += 1;
  }

  console.log(`Scanned ${scanned} unlinked tenant row(s).`);
  console.log(`Linked ${linked} to a tenant user by email.`);
  console.log(`Skipped ${skipped} (no matching verified tenant user).`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
