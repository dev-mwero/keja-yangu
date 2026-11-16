import dotenv from "dotenv";
import mongoose from "mongoose";
import {
  type CutoverCandidateUser,
  planCutoverPreflight,
  planRoleCutover,
  planRoleRollback,
} from "../src/lib/role-cutover.ts";

dotenv.config({ path: ".env.local" });

const userSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    role: String,
    migratedFromOwner: { type: Boolean, default: false },
  },
  { collection: "users", timestamps: true },
);

// Mirrors src/models/AuditEvent.ts (field-for-field) so documents written
// here are read correctly by the app's audit queries.
const auditEventSchema = new mongoose.Schema(
  {
    actorUserId: { type: String, required: true },
    actorRole: { type: String, required: true },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, default: "" },
    scope: {
      propertyId: { type: String, default: "" },
      blockId: { type: String, default: "" },
      unitId: { type: String, default: "" },
    },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    requestId: { type: String, default: "" },
    ipHash: { type: String, default: "" },
    userAgentHash: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "audit_events", versionKey: false },
);

const managementAssignmentSchema = new mongoose.Schema(
  {
    principalUserId: String,
    status: String,
    startsAt: Date,
    endsAt: Date,
  },
  { collection: "managementassignments" },
);

async function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes("--apply");
  const isRollback = args.includes("--rollback");
  const isDryRun = !isApply || args.includes("--dry-run");

  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/keja-yangu?replicaSet=rs0";

  console.log(`Connecting to MongoDB at ${mongoUri}...`);
  await mongoose.connect(mongoUri);

  const User = mongoose.model("CutoverUser", userSchema);
  const AuditEvent = mongoose.model("CutoverAuditEvent", auditEventSchema);
  const ManagementAssignment = mongoose.model(
    "CutoverManagementAssignment",
    managementAssignmentSchema,
  );

  const rawUsers = await User.find({}).lean();
  const users: CutoverCandidateUser[] = rawUsers.map((u) => ({
    _id: String(u._id),
    name: u.name as string | undefined,
    email: u.email as string | undefined,
    role: String(u.role ?? ""),
    migratedFromOwner: Boolean((u as { migratedFromOwner?: boolean }).migratedFromOwner),
  }));

  console.log(`Loaded ${users.length} user records from database.`);

  if (isRollback) {
    console.log("\n--- PLANNING ROLE ROLLBACK (admin[migratedFromOwner] -> owner) ---");
    const plan = planRoleRollback(users);

    console.log(`Users to rollback: ${plan.usersToRollback.length}`);
    console.log(`Skipped users: ${plan.skippedCount}`);
    if (plan.warnings.length > 0) {
      console.log(`Warnings (${plan.warnings.length}):`);
      for (const w of plan.warnings) console.log(`  - ${w}`);
    }

    if (isDryRun) {
      console.log("\n[DRY-RUN] No changes were applied to the database. Use --apply to execute.");
      await mongoose.disconnect();
      return;
    }

    console.log("\n[APPLY] Executing rollback...");
    let updatedCount = 0;
    for (const item of plan.usersToRollback) {
      await User.updateOne(
        { _id: item.userId },
        { $set: { role: item.toRole, migratedFromOwner: false } },
      );
      updatedCount += 1;
    }

    if (plan.auditEvents.length > 0) {
      await AuditEvent.insertMany(plan.auditEvents);
    }

    console.log(`Rollback completed: ${updatedCount} users updated to owner role.`);
  } else {
    console.log("\n--- PLANNING ROLE CUTOVER (owner -> admin) ---");
    const plan = planRoleCutover(users);

    console.log(`Users to cut over: ${plan.usersToUpdate.length}`);
    console.log(`Skipped users: ${plan.skippedCount}`);
    if (plan.warnings.length > 0) {
      console.log(`Warnings (${plan.warnings.length}):`);
      for (const w of plan.warnings) console.log(`  - ${w}`);
    }

    // Assignment-coverage gate: an owner promoted to admin without an active
    // ManagementAssignment is locked out of the dashboard (admin access is
    // assignment-scoped). Fail closed in --apply mode.
    const now = new Date();
    const ownerIds = plan.usersToUpdate.map((item) => item.userId);
    const assignments = await ManagementAssignment.find({
      principalUserId: { $in: ownerIds },
      status: "active",
      startsAt: { $lte: now },
      $or: [{ endsAt: null }, { endsAt: { $gt: now } }],
    })
      .select("principalUserId")
      .lean();
    const activeAssignmentUserIds = new Set(
      assignments.map((assignment) => String(assignment.principalUserId)),
    );
    const preflight = planCutoverPreflight(users, activeAssignmentUserIds);

    if (!preflight.ready) {
      console.log(
        `\n[PREFLIGHT] BLOCKED — ${preflight.uncovered.length} owner(s) have no active assignment:`,
      );
      for (const item of preflight.uncovered) {
        console.log(`  - ${item.userId} ${item.email ?? item.name ?? ""}`.trimEnd());
      }
      console.log("Create active ManagementAssignment rows for these users, then re-run.");
      if (!isDryRun) {
        console.error("[APPLY ABORTED] Preflight gate failed; no changes written.");
        await mongoose.disconnect();
        process.exit(1);
      }
    } else {
      console.log(
        `\n[PREFLIGHT] Ready — all ${plan.usersToUpdate.length} owner(s) hold an active assignment.`,
      );
    }

    if (isDryRun) {
      console.log("\n[DRY-RUN] No changes were applied to the database. Use --apply to execute.");
      await mongoose.disconnect();
      return;
    }

    console.log("\n[APPLY] Executing role cutover...");
    let updatedCount = 0;
    for (const item of plan.usersToUpdate) {
      await User.updateOne(
        { _id: item.userId },
        { $set: { role: item.toRole, migratedFromOwner: true } },
      );
      updatedCount += 1;
    }

    if (plan.auditEvents.length > 0) {
      await AuditEvent.insertMany(plan.auditEvents);
    }

    console.log(`Cutover completed: ${updatedCount} users updated to admin role.`);
  }

  await mongoose.disconnect();
  console.log("Database disconnected.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
