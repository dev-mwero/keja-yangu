import dotenv from "dotenv";
import mongoose from "mongoose";
import {
  type BackfillInvoice,
  type BackfillLease,
  type BackfillOwner,
  type BackfillPayment,
  type BackfillUnit,
  planBillingBackfill,
} from "../src/lib/billing-backfill.ts";

dotenv.config({ path: ".env.local" });

const userSchema = new mongoose.Schema({ name: String, role: String }, { collection: "users" });

const unitSchema = new mongoose.Schema(
  {
    propertyId: String,
    ownerId: String,
    billingAccountId: String,
    deletedAt: { type: Date, default: null },
  },
  { collection: "units" },
);

const leaseSchema = new mongoose.Schema(
  {
    unitId: String,
    ownerId: String,
    billingAccountId: String,
    status: String,
    deletedAt: { type: Date, default: null },
  },
  { collection: "leases" },
);

const invoiceSchema = new mongoose.Schema(
  {
    leaseId: String,
    unitId: String,
    ownerId: String,
    billingAccountId: String,
    deletedAt: { type: Date, default: null },
  },
  { collection: "invoices" },
);

const paymentSchema = new mongoose.Schema(
  { invoiceId: String, unitId: String, ownerId: String, billingAccountId: String },
  { collection: "payments" },
);

const billingAccountSchema = new mongoose.Schema(
  {
    ownerAdminId: { type: String, required: true },
    legalEntityName: { type: String, required: true },
    invoicePrefix: { type: String, required: true },
    invoiceCounters: { type: Map, of: Number, default: () => new Map() },
    defaultCurrency: { type: String, default: "KES" },
    status: { type: String, default: "active" },
    legacyOwnerId: { type: String, default: "" },
    deletedAt: { type: Date, default: null },
  },
  { collection: "billingaccounts", timestamps: true },
);

const unitBillingAssignmentSchema = new mongoose.Schema(
  {
    unitId: { type: String, required: true },
    billingAccountId: { type: String, required: true },
    effectiveFrom: { type: Date, default: Date.now },
    effectiveTo: { type: Date, default: null },
    status: { type: String, default: "active" },
    assignedByUserId: { type: String, default: "system" },
    reason: { type: String, default: "" },
  },
  { collection: "unitbillingassignments", timestamps: true },
);

async function main() {
  const apply = process.argv.includes("--apply");
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("MONGODB_URI is not set in environment or .env.local");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);

  const User = mongoose.models.BackfillUser || mongoose.model("BackfillUser", userSchema);
  const Unit = mongoose.models.BackfillUnit || mongoose.model("BackfillUnit", unitSchema);
  const Lease = mongoose.models.BackfillLease || mongoose.model("BackfillLease", leaseSchema);
  const Invoice =
    mongoose.models.BackfillInvoice || mongoose.model("BackfillInvoice", invoiceSchema);
  const Payment =
    mongoose.models.BackfillPayment || mongoose.model("BackfillPayment", paymentSchema);
  const BillingAccount =
    mongoose.models.BackfillBillingAccount ||
    mongoose.model("BackfillBillingAccount", billingAccountSchema);
  const UnitBillingAssignment =
    mongoose.models.BackfillUnitBillingAssignment ||
    mongoose.model("BackfillUnitBillingAssignment", unitBillingAssignmentSchema);

  const [owners, units, leases, invoices, payments] = await Promise.all([
    User.find({ role: { $in: ["owner", "admin"] } })
      .select("_id name role")
      .lean() as Promise<BackfillOwner[]>,
    Unit.find({ deletedAt: null })
      .select("_id propertyId ownerId billingAccountId")
      .lean() as Promise<BackfillUnit[]>,
    Lease.find({ deletedAt: null }).select("_id unitId ownerId billingAccountId").lean() as Promise<
      BackfillLease[]
    >,
    Invoice.find({ deletedAt: null })
      .select("_id leaseId unitId ownerId billingAccountId")
      .lean() as Promise<BackfillInvoice[]>,
    Payment.find({}).select("_id invoiceId unitId ownerId billingAccountId").lean() as Promise<
      BackfillPayment[]
    >,
  ]);

  const plan = planBillingBackfill({ owners, units, leases, invoices, payments });

  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN (pass --apply to write)"}`);
  console.log(`Owners scanned: ${owners.length}`);
  console.log(`Units scanned: ${units.length}`);
  console.log(`Leases scanned: ${leases.length}`);
  console.log(`Invoices scanned: ${invoices.length}`);
  console.log(`Payments scanned: ${payments.length}`);
  console.log(`Billing accounts planned: ${plan.billingAccounts.length}`);
  console.log(`Unit billing assignments planned: ${plan.unitAssignments.length}`);
  console.log(`Warnings: ${plan.warnings.length}`);
  if (plan.warnings.length > 0) {
    for (const w of plan.warnings.slice(0, 10)) console.warn(`  - ${w}`);
  }

  if (!apply) {
    console.log("No writes performed. Re-run with --apply after reviewing the plan.");
    return;
  }

  const accountIdByOwner = new Map<string, string>();

  for (const ba of plan.billingAccounts) {
    const res = await BillingAccount.findOneAndUpdate(
      { ownerAdminId: ba.ownerAdminId, status: "active", deletedAt: null },
      {
        $setOnInsert: {
          ownerAdminId: ba.ownerAdminId,
          legalEntityName: ba.legalEntityName,
          invoicePrefix: ba.invoicePrefix,
          legacyOwnerId: ba.legacyOwnerId,
          status: "active",
        },
      },
      { upsert: true, new: true },
    );
    if (res?._id) {
      accountIdByOwner.set(ba.ownerAdminId, String(res._id));
    }
  }

  for (const uba of plan.unitAssignments) {
    const baId = accountIdByOwner.get(uba.ownerAdminId);
    if (!baId) continue;

    await UnitBillingAssignment.findOneAndUpdate(
      { unitId: uba.unitId, status: "active" },
      {
        $setOnInsert: {
          unitId: uba.unitId,
          billingAccountId: baId,
          effectiveFrom: new Date(),
          status: "active",
          assignedByUserId: "system",
          reason: uba.reason,
        },
      },
      { upsert: true },
    );

    await Unit.updateOne(
      { _id: uba.unitId, billingAccountId: { $in: ["", null] } },
      { $set: { billingAccountId: baId } },
    );
  }

  for (const l of plan.leaseUpdates) {
    const baId = accountIdByOwner.get(l.ownerAdminId);
    if (baId) {
      await Lease.updateOne(
        { _id: l.leaseId, billingAccountId: { $in: ["", null] } },
        { $set: { billingAccountId: baId } },
      );
    }
  }

  for (const inv of plan.invoiceUpdates) {
    const baId = accountIdByOwner.get(inv.ownerAdminId);
    if (baId) {
      await Invoice.updateOne(
        { _id: inv.invoiceId, billingAccountId: { $in: ["", null] } },
        { $set: { billingAccountId: baId } },
      );
    }
  }

  for (const p of plan.paymentUpdates) {
    const baId = accountIdByOwner.get(p.ownerAdminId);
    if (baId) {
      await Payment.updateOne(
        { _id: p.paymentId, billingAccountId: { $in: ["", null] } },
        { $set: { billingAccountId: baId } },
      );
    }
  }

  console.log("Billing accounts, unit assignments, and entity updates applied successfully.");
}

main()
  .then(async () => {
    await mongoose.disconnect();
    console.log("Billing account backfill complete.");
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Billing account backfill failed:", error);
    await mongoose.disconnect();
    process.exit(1);
  });
