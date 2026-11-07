import dotenv from "dotenv";
import mongoose, { Schema } from "mongoose";

dotenv.config({ path: ".env.local" });

/**
 * Builds the indexes introduced by the role-capability work (assignment-scoped
 * authorization) plus the chat unread-count index on existing production
 * datasets.
 *
 * The app relies on Mongoose autoIndex, which builds indexes lazily when a
 * model first connects. In serverless/production that is not guaranteed, and
 * several of these indexes are correctness guarantees (e.g. the partial
 * unique assignment index and the invoice generation idempotency indexes), so
 * this script builds them explicitly. Run with `--dry-run` to preview without
 * writing.
 *
 * Schemas are declared locally (the app models are not imported) to keep the
 * script runnable under tsx without the `@/` path alias. Each schema mirrors
 * the FULL index set of its app model — including the soft-delete plugin's
 * implicit `deletedAt` index — so `syncIndexes()` does not drop indexes the
 * app model defines.
 */

// The soft-delete plugin (src/lib/mongoose-soft-delete.ts) adds
// `deletedAt: { type: Date, default: null, index: true }`, which creates the
// implicit `deletedAt_1` index on every model it touches.
const softDeleteField = {
  deletedAt: { type: Date, default: null, index: true },
};

// ── ManagementAssignment (new collection, no soft delete) ───────────────────
const managementAssignmentSchema = new Schema(
  {
    principalUserId: String,
    accessRole: String,
    scopeType: String,
    propertyId: String,
    blockId: String,
    unitId: String,
    status: String,
    startsAt: Date,
    endsAt: Date,
  },
  { collection: "managementassignments" },
);
managementAssignmentSchema.index(
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
managementAssignmentSchema.index({ principalUserId: 1, status: 1, startsAt: 1, endsAt: 1 });
managementAssignmentSchema.index({ propertyId: 1, scopeType: 1, status: 1 });
managementAssignmentSchema.index({ blockId: 1, status: 1 });
managementAssignmentSchema.index({ unitId: 1, status: 1 });

// ── Property (soft delete) ──────────────────────────────────────────────────
const propertySchema = new Schema(
  {
    status: String,
    published: Boolean,
    identityHash: String,
    ownerId: String,
    caretakerIds: [String],
    custodianIds: [String],
    createdById: String,
    ...softDeleteField,
  },
  { collection: "properties" },
);
propertySchema.index({ status: 1, published: 1 });
propertySchema.index({ identityHash: 1 }, { sparse: true });
propertySchema.index({ ownerId: 1 });
propertySchema.index({ caretakerIds: 1 });
propertySchema.index({ custodianIds: 1 });
propertySchema.index({ createdById: 1 });
propertySchema.index({ ownerId: 1, status: 1 });

// ── Unit (soft delete) ──────────────────────────────────────────────────────
const unitSchema = new Schema(
  {
    propertyId: String,
    ownerId: String,
    blockId: String,
    name: String,
    status: String,
    floorLevel: Number,
    ...softDeleteField,
  },
  { collection: "units" },
);
unitSchema.index(
  { blockId: 1, name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
unitSchema.index({ propertyId: 1, status: 1 });
unitSchema.index({ ownerId: 1, status: 1 });
unitSchema.index({ blockId: 1, floorLevel: 1 });
unitSchema.index({ propertyId: 1, blockId: 1 });
unitSchema.index({ ownerId: 1, propertyId: 1 });

// ── Tenant (soft delete) ────────────────────────────────────────────────────
const tenantSchema = new Schema(
  {
    propertyId: String,
    email: String,
    phone: String,
    userId: String,
    ownerId: String,
    status: String,
    ...softDeleteField,
  },
  { collection: "tenants" },
);
tenantSchema.index(
  { propertyId: 1, email: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null, email: { $gt: "" } } },
);
tenantSchema.index(
  { propertyId: 1, phone: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null, phone: { $gt: "" } } },
);
tenantSchema.index({ userId: 1 });
tenantSchema.index({ ownerId: 1 });
tenantSchema.index({ propertyId: 1, status: 1 });
tenantSchema.index({ ownerId: 1, status: 1 });

// ── Lease (soft delete) ─────────────────────────────────────────────────────
const leaseSchema = new Schema(
  {
    ownerId: String,
    tenantId: String,
    propertyId: String,
    unitId: String,
    status: String,
    ...softDeleteField,
  },
  { collection: "leases" },
);
leaseSchema.index({ ownerId: 1 });
leaseSchema.index({ tenantId: 1 });
leaseSchema.index({ propertyId: 1 });
leaseSchema.index({ unitId: 1, status: 1 });
leaseSchema.index({ ownerId: 1, status: 1 });
leaseSchema.index({ propertyId: 1, status: 1 });
leaseSchema.index({ ownerId: 1, propertyId: 1 });
leaseSchema.index(
  { tenantId: 1 },
  {
    unique: true,
    name: "lease_active_tenant_unique",
    partialFilterExpression: { status: "active", deletedAt: null },
  },
);

// ── Invoice (soft delete) ───────────────────────────────────────────────────
const invoiceSchema = new Schema(
  {
    ownerId: String,
    billingAccountId: String,
    tenantId: String,
    propertyId: String,
    status: String,
    dueDate: Date,
    invoiceNumber: String,
    leaseId: String,
    period: String,
    ...softDeleteField,
  },
  { collection: "invoices" },
);
invoiceSchema.index({ ownerId: 1, period: 1 });
invoiceSchema.index({ billingAccountId: 1, period: 1 });
invoiceSchema.index({ tenantId: 1 });
invoiceSchema.index({ propertyId: 1, period: 1 });
invoiceSchema.index({ status: 1, dueDate: 1 });
invoiceSchema.index({ ownerId: 1, status: 1 });
invoiceSchema.index(
  { invoiceNumber: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
invoiceSchema.index(
  { leaseId: 1, period: 1 },
  { unique: true, partialFilterExpression: { leaseId: { $gt: "" }, deletedAt: null } },
);

// ── User (no soft delete) ───────────────────────────────────────────────────
const userSchema = new Schema(
  {
    role: String,
    managedByOwnerId: String,
    isActive: Boolean,
    phone: String,
    email: String,
  },
  { collection: "users" },
);
userSchema.index({ role: 1, managedByOwnerId: 1 });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $gt: "" } } });
userSchema.index({ email: 1 }, { unique: true, sparse: true });

// ── ChatMessage (no soft delete) ────────────────────────────────────────────
// The `{ threadId, senderUserId, createdAt }` composite supports the batched
// unread-count aggregation (one $match over the visible threads instead of one
// countDocuments per thread).
const chatMessageSchema = new Schema(
  {
    threadId: String,
    senderUserId: String,
    createdAt: Date,
  },
  { collection: "chatmessages" },
);
chatMessageSchema.index({ threadId: 1, createdAt: 1 });
chatMessageSchema.index({ threadId: 1, senderUserId: 1, createdAt: 1 });

const MODELS: { name: string; schema: Schema }[] = [
  { name: "ManagementAssignment", schema: managementAssignmentSchema },
  { name: "Property", schema: propertySchema },
  { name: "Unit", schema: unitSchema },
  { name: "Tenant", schema: tenantSchema },
  { name: "Lease", schema: leaseSchema },
  { name: "Invoice", schema: invoiceSchema },
  { name: "User", schema: userSchema },
  { name: "ChatMessage", schema: chatMessageSchema },
];

async function existingIndexNames(model: mongoose.Model<unknown>): Promise<string[]> {
  try {
    return (await model.collection.indexes())
      .map((ix) => ix.name)
      .filter((name): name is string => Boolean(name));
  } catch (error) {
    // NamespaceNotFound: collection does not exist yet (nothing written).
    if ((error as { code?: number }).code === 26) return [];
    throw error;
  }
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

  for (const { name, schema } of MODELS) {
    const Model = mongoose.models[name] ?? mongoose.model(name, schema);
    const collection = Model.collection.collectionName;

    const before = await existingIndexNames(Model);
    const { toCreate, toDrop } = await Model.diffIndexes();
    const names = (specs: unknown[]) =>
      specs.map((spec) => (spec as { name?: string }).name ?? JSON.stringify(spec));

    if (dryRun) {
      console.log(`[${collection}] existing indexes: ${before.join(", ") || "(none)"}`);
      if (toCreate.length > 0) console.log(`  would create: ${names(toCreate).join(", ")}`);
      if (toDrop.length > 0) console.log(`  would drop:   ${names(toDrop).join(", ")}`);
      continue;
    }

    await Model.syncIndexes();

    const after = await existingIndexNames(Model);
    console.log(`[${collection}] indexes now: ${after.join(", ")}`);
  }

  if (dryRun) {
    await mongoose.disconnect();
    console.log("Dry run complete (no changes written).");
    return;
  }

  await mongoose.disconnect();
  console.log("Migration complete.");
}

main().catch(async (error) => {
  console.error("Role-capability index migration failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});
