import dotenv from "dotenv";
import mongoose from "mongoose";
import {
  type BackfillWarning,
  type LegacyBackfillProperty,
  type LegacyBackfillUser,
  planAssignmentBackfill,
} from "../src/lib/assignment-backfill.ts";

dotenv.config({ path: ".env.local" });

// Minimal schemas (script independence): the app models are intentionally not
// imported so the backfill runs against the shape of the deployed collections.
const userSchema = new mongoose.Schema(
  {
    role: String,
    privileges: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { collection: "users" },
);

const propertySchema = new mongoose.Schema(
  {
    ownerId: { type: String, default: "" },
    custodianIds: { type: [String], default: [] },
    caretakerIds: { type: [String], default: [] },
    deletedAt: { type: Date, default: null },
  },
  { collection: "properties" },
);

const assignmentSchema = new mongoose.Schema(
  {
    principalUserId: { type: String, required: true },
    accessRole: { type: String, required: true },
    scopeType: { type: String, required: true },
    propertyId: { type: String, required: true },
    blockId: { type: String, default: "" },
    unitId: { type: String, default: "" },
    permissions: { type: [String], default: [] },
    status: { type: String, default: "pending" },
    startsAt: { type: Date, default: Date.now },
    endsAt: { type: Date, default: null },
    grantedByUserId: { type: String, required: true },
    grantedAt: { type: Date, default: Date.now },
    acceptedAt: { type: Date, default: null },
    revokedByUserId: { type: String, default: "" },
    revokedAt: { type: Date, default: null },
    reason: { type: String, default: "" },
    source: { type: String, default: "system" },
    legacyOwnerId: { type: String, default: "" },
  },
  { collection: "managementassignments", timestamps: true },
);

assignmentSchema.index(
  {
    principalUserId: 1,
    accessRole: 1,
    scopeType: 1,
    propertyId: 1,
    blockId: 1,
    unitId: 1,
  },
  { unique: true, partialFilterExpression: { status: "active" } },
);

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

function warningSummary(warnings: BackfillWarning[]): string {
  const counts = new Map<string, number>();
  for (const warning of warnings) {
    const key = warning.privilege ? `${warning.code}:${warning.privilege}` : warning.code;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => `  - ${key}: ${count}`)
    .join("\n");
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("Missing MONGODB_URI environment variable.");
  }

  const apply = process.argv.includes("--apply");
  const now = new Date();

  await mongoose.connect(mongoUri, {
    bufferCommands: false,
    maxPoolSize: 10,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
  });

  const User = mongoose.models.User || mongoose.model("User", userSchema);
  const Property = mongoose.models.Property || mongoose.model("Property", propertySchema);
  const Assignment =
    mongoose.models.ManagementAssignment ||
    mongoose.model("ManagementAssignment", assignmentSchema);

  const properties = (await Property.find({ deletedAt: null })
    .select("_id ownerId custodianIds caretakerIds")
    .lean()) as unknown as LegacyBackfillProperty[];

  const principalIds = new Set<string>();
  for (const property of properties) {
    if (property.ownerId) principalIds.add(String(property.ownerId));
    for (const id of property.custodianIds ?? []) principalIds.add(String(id));
    for (const id of property.caretakerIds ?? []) principalIds.add(String(id));
  }

  const validIds = [...principalIds]
    .filter((id) => OBJECT_ID.test(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const users = (validIds.length
    ? await User.find({ _id: { $in: validIds } })
        .select("_id role privileges isActive")
        .lean()
    : []) as unknown as LegacyBackfillUser[];

  const plan = planAssignmentBackfill({ properties, users, now });

  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN (pass --apply to write)"}`);
  console.log(`Live properties scanned: ${properties.length}`);
  console.log(`Referenced principals: ${principalIds.size}`);
  console.log(`Users resolved: ${users.length}`);
  console.log(`Assignments planned: ${plan.assignments.length}`);
  console.log(
    `  admin: ${plan.assignments.filter((a) => a.accessRole === "admin").length}, ` +
      `custodian: ${plan.assignments.filter((a) => a.accessRole === "custodian").length}, ` +
      `caretaker: ${plan.assignments.filter((a) => a.accessRole === "caretaker").length}`,
  );
  console.log(`Warnings: ${plan.warnings.length}`);
  if (plan.warnings.length) console.log(warningSummary(plan.warnings));

  if (!apply) {
    console.log("No writes performed. Re-run with --apply after reviewing the plan.");
    return;
  }

  let inserted = 0;
  let existing = 0;
  for (const assignment of plan.assignments) {
    const result = await Assignment.updateOne(
      {
        principalUserId: assignment.principalUserId,
        accessRole: assignment.accessRole,
        scopeType: assignment.scopeType,
        propertyId: assignment.propertyId,
        blockId: "",
        unitId: "",
        status: "active",
      },
      { $setOnInsert: assignment },
      { upsert: true },
    );
    if (result.upsertedCount > 0) inserted++;
    else existing++;
  }

  console.log(`Assignments inserted: ${inserted}`);
  console.log(`Assignments already active: ${existing}`);
}

main()
  .then(async () => {
    await mongoose.disconnect();
    console.log("Management assignment backfill complete.");
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Management assignment backfill failed:", error);
    await mongoose.disconnect();
    process.exit(1);
  });
