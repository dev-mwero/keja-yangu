import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config({ path: ".env.local" });

/**
 * Grant or revoke the `system-admin` role.
 *
 * The dashboard role-management surface deliberately cannot touch
 * `system-admin`; this script is the only supported path. It is audited,
 * dry-run by default, and requires a different existing system-admin as the
 * operator (two-person control). The very first administrator must be created
 * with `--bootstrap` while no active system-admin exists.
 *
 * Usage:
 *   npm run admin:grant -- --email admin@example.com --operator-email root@example.com --apply
 *   npm run admin:grant -- --email admin@example.com --bootstrap --apply   # first admin only
 *   npm run admin:grant -- --email admin@example.com --revoke --operator-email root@example.com --apply
 */

const ASSIGNABLE_ROLES = ["tenant", "caretaker", "custodian", "admin", "broker"];

const userSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    role: String,
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
    privileges: { type: [String], default: [] },
    tokenVersion: { type: Number, default: 0 },
  },
  { collection: "users", timestamps: true },
);

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

interface CliOptions {
  email: string;
  operatorEmail: string;
  toRole: string;
  reason: string;
  apply: boolean;
  revoke: boolean;
  bootstrap: boolean;
  minAdmins: number;
}

function parseArgs(argv: string[]): CliOptions {
  const get = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const email = get("--email")?.trim().toLowerCase() ?? "";
  if (!email) {
    throw new Error("--email is required");
  }
  const minAdminsRaw = get("--min-admins");
  return {
    email,
    operatorEmail: get("--operator-email")?.trim().toLowerCase() ?? "",
    toRole: get("--to-role")?.trim() ?? "admin",
    reason: get("--reason")?.trim() ?? "",
    apply: argv.includes("--apply"),
    revoke: argv.includes("--revoke"),
    bootstrap: argv.includes("--bootstrap"),
    minAdmins: minAdminsRaw ? Number.parseInt(minAdminsRaw, 10) : 2,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not set");
  }
  console.log(`Connecting to MongoDB at ${mongoUri}...`);
  await mongoose.connect(mongoUri);

  const User = mongoose.model("RoleManagementUser", userSchema);
  const AuditEvent = mongoose.model("RoleManagementAuditEvent", auditEventSchema);

  const target = await User.findOne({ email: options.email }).lean();
  if (!target) {
    throw new Error(`No user found with email ${options.email}`);
  }
  const targetId = String(target._id);

  const activeAdmins = await User.countDocuments({ role: "system-admin", isActive: true });

  if (options.revoke) {
    if (target.role !== "system-admin") {
      console.log(`${options.email} is not a system-admin. Nothing to do.`);
      return;
    }
    if (activeAdmins - 1 < options.minAdmins) {
      throw new Error(
        `Refusing to revoke: ${activeAdmins} active system-admin(s) would drop below the floor of ${options.minAdmins}. Pass --min-admins to override explicitly.`,
      );
    }
    if (!options.operatorEmail) {
      throw new Error("--operator-email is required for revocation (two-person control)");
    }
    if (!ASSIGNABLE_ROLES.includes(options.toRole)) {
      throw new Error(`--to-role must be one of: ${ASSIGNABLE_ROLES.join(", ")}`);
    }
    const operator = await User.findOne({
      email: options.operatorEmail,
      role: "system-admin",
      isActive: true,
    }).lean();
    if (!operator) {
      throw new Error("--operator-email must reference an active system-admin");
    }
    if (String(operator._id) === targetId) {
      throw new Error("The operator cannot be the target (no self-demotion)");
    }

    const before = { role: target.role, tokenVersion: target.tokenVersion ?? 0 };
    const after = {
      role: options.toRole,
      privileges: [],
      tokenVersion: (target.tokenVersion ?? 0) + 1,
      reason: options.reason || "CLI revocation",
    };

    console.log("\nPlan: DEMOTE system-admin");
    console.log(`  target: ${options.email} (${targetId})`);
    console.log(`  from:   ${before.role}`);
    console.log(`  to:     ${after.role}`);
    console.log(`  operator: ${options.operatorEmail}`);

    if (!options.apply) {
      console.log("\nDry run. Re-run with --apply to commit.");
      return;
    }

    await AuditEvent.create({
      actorUserId: String(operator._id),
      actorRole: "system-admin",
      action: "user.role_changed",
      entityType: "user",
      entityId: targetId,
      before,
      after,
    });
    await User.updateOne(
      { _id: targetId },
      {
        $set: {
          role: after.role,
          privileges: [],
          tokenVersion: after.tokenVersion,
        },
      },
    );
    console.log("\nSystem-admin revoked and audited.");
    return;
  }

  // Grant flow.
  if (target.role === "system-admin") {
    console.log(`${options.email} is already a system-admin. Nothing to do.`);
    return;
  }
  if (target.isActive === false) {
    throw new Error("Target account is inactive; activate it before granting system-admin");
  }

  let operatorId = "bootstrap-cli";
  let operatorEmail = "bootstrap";
  if (options.bootstrap) {
    if (activeAdmins > 0) {
      throw new Error(
        "--bootstrap is only allowed while no active system-admin exists. Use --operator-email instead.",
      );
    }
    if (options.operatorEmail) {
      throw new Error("Use either --bootstrap or --operator-email, not both");
    }
  } else {
    if (!options.operatorEmail) {
      throw new Error("--operator-email is required (two-person control)");
    }
    const operator = await User.findOne({
      email: options.operatorEmail,
      role: "system-admin",
      isActive: true,
    }).lean();
    if (!operator) {
      throw new Error("--operator-email must reference an active system-admin");
    }
    if (String(operator._id) === targetId) {
      throw new Error("The operator cannot be the target (no self-promotion)");
    }
    operatorId = String(operator._id);
    operatorEmail = options.operatorEmail;
  }

  const before = { role: target.role, tokenVersion: target.tokenVersion ?? 0 };
  const after = {
    role: "system-admin",
    privileges: [],
    tokenVersion: (target.tokenVersion ?? 0) + 1,
    reason: options.reason || (options.bootstrap ? "Bootstrap" : "CLI grant"),
  };

  console.log("\nPlan: GRANT system-admin");
  console.log(`  target:   ${options.email} (${targetId})`);
  console.log(`  from:     ${before.role}`);
  console.log(`  to:       system-admin`);
  console.log(`  operator: ${operatorEmail}`);

  if (!options.apply) {
    console.log("\nDry run. Re-run with --apply to commit.");
    return;
  }

  await AuditEvent.create({
    actorUserId: operatorId,
    actorRole: "system-admin",
    action: "user.role_changed",
    entityType: "user",
    entityId: targetId,
    before,
    after,
  });
  await User.updateOne(
    { _id: targetId },
    {
      $set: {
        role: "system-admin",
        privileges: [],
        tokenVersion: after.tokenVersion,
        isActive: true,
      },
    },
  );
  console.log("\nSystem-admin granted and audited. The target must sign in again.");
}

main()
  .catch((error) => {
    console.error(`\nError: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
