import dotenv from "dotenv";
import mongoose, { Schema } from "mongoose";
import {
  buildLegacyReadinessReport,
  type ReadinessAssignment,
  type ReadinessBillingAccount,
  type ReadinessBlock,
  type ReadinessProperty,
  type ReadinessUnit,
  type ReadinessUser,
} from "@/lib/legacy-readiness-report";

dotenv.config({ path: ".env.local" });

/**
 * Phase 9 legacy-readiness audit (read-only).
 *
 * Local schemas mirror the app models' relevant fields so the script can run
 * under tsx: importing the app models directly fails because Node's CJS lexer
 * cannot detect mongoose's `models` export under ESM
 * (`The requested module 'mongoose' does not provide an export named 'models'`).
 * The pure report builder is shared with the app lib
 * (`src/lib/legacy-readiness-report.ts`) so the verdict logic never drifts.
 *
 * `{ deletedAt: null }` matches both null and missing, equivalent to the
 * soft-delete plugin's default read exclusion.
 */

const softDelete = { deletedAt: { type: Date, default: null } };

const userSchema = new Schema(
  { role: String, isActive: Boolean, managedByOwnerId: String },
  { collection: "users" },
);
const propertySchema = new Schema(
  {
    ownerId: String,
    caretakerIds: [String],
    custodianIds: [String],
    ...softDelete,
  },
  { collection: "properties" },
);
const unitSchema = new Schema(
  { propertyId: String, blockId: String, billingAccountId: String, ...softDelete },
  { collection: "units" },
);
const blockSchema = new Schema({ propertyId: String, ...softDelete }, { collection: "blocks" });
const billingAccountSchema = new Schema(
  { status: String, ...softDelete },
  { collection: "billingaccounts" },
);
const managementAssignmentSchema = new Schema(
  {
    principalUserId: String,
    accessRole: String,
    scopeType: String,
    propertyId: String,
    blockId: String,
    unitId: String,
    status: String,
  },
  { collection: "managementassignments" },
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

  const User = mongoose.models.ReadinessUser ?? mongoose.model("ReadinessUser", userSchema);
  const Property =
    mongoose.models.ReadinessProperty ?? mongoose.model("ReadinessProperty", propertySchema);
  const Unit = mongoose.models.ReadinessUnit ?? mongoose.model("ReadinessUnit", unitSchema);
  const Block = mongoose.models.ReadinessBlock ?? mongoose.model("ReadinessBlock", blockSchema);
  const BillingAccount =
    mongoose.models.ReadinessBillingAccount ??
    mongoose.model("ReadinessBillingAccount", billingAccountSchema);
  const ManagementAssignment =
    mongoose.models.ReadinessManagementAssignment ??
    mongoose.model("ReadinessManagementAssignment", managementAssignmentSchema);

  const [properties, users, assignments, units, blocks, billingAccounts] = await Promise.all([
    Property.find({ deletedAt: null })
      .select("_id ownerId caretakerIds custodianIds deletedAt")
      .lean(),
    User.find({ isActive: true }).select("_id role isActive managedByOwnerId").lean(),
    ManagementAssignment.find({ status: "active" })
      .select("_id principalUserId accessRole scopeType propertyId blockId unitId")
      .lean(),
    Unit.find({ deletedAt: null })
      .select("_id propertyId blockId billingAccountId deletedAt")
      .lean(),
    Block.find({ deletedAt: null }).select("_id propertyId deletedAt").lean(),
    BillingAccount.find({ deletedAt: null }).select("_id status deletedAt").lean(),
  ]);

  const report = buildLegacyReadinessReport({
    properties: properties as unknown as ReadinessProperty[],
    users: users as unknown as ReadinessUser[],
    assignments: assignments as unknown as ReadinessAssignment[],
    units: units as unknown as ReadinessUnit[],
    blocks: blocks as unknown as ReadinessBlock[],
    billingAccounts: billingAccounts as unknown as ReadinessBillingAccount[],
  });

  console.log("🔍 Phase 9 legacy readiness audit (read-only)...\n");
  console.log("Counts:");
  console.table(report.counts);
  console.log(
    `Status: ${report.readyForLegacyRetirement ? "✅ READY" : "⚠️ LEGACY RETIREMENT BLOCKED"}\n`,
  );

  const blocking = Object.entries(report.blocking).filter(([, rows]) => rows.length > 0);
  for (const [name, rows] of blocking) {
    console.log(`${name} (${rows.length}):`);
    console.table(rows);
  }
  if (blocking.length === 0) {
    console.log("No blocking drift found.");
  }

  // Exit non-zero unless retirement is actually ready: empty blocking lists
  // alone are not enough while legacy counts remain.
  await mongoose.disconnect();
  process.exit(report.readyForLegacyRetirement ? 0 : 1);
}

main().catch(async (error) => {
  console.error("Phase 9 readiness audit failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});
