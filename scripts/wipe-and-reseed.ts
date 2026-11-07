import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

dotenv.config({ path: ".env.local" });

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error("Missing MONGODB_URI");

const softDelete = { deletedAt: { type: Date, default: null } };

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, required: true },
    privileges: { type: [String], default: [] },
    managedByOwnerId: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: true },
    phone: { type: String, default: "" },
    whatsapp: { type: String, default: "" },
    nationalId: { type: String, default: "" },
    tokenVersion: { type: Number, default: 0 },
    settings: { type: Object, default: {} },
  },
  { collection: "users" },
);

const propertySchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    location: { type: String, required: true },
    price: { type: Number, required: true, default: 0 },
    beds: { type: Number, default: 0 },
    baths: { type: Number, default: 0 },
    type: { type: String, default: "apartment" },
    ownerId: { type: String, default: "" },
    createdById: { type: String, default: "" },
    caretakerIds: { type: [String], default: [] },
    custodianIds: { type: [String], default: [] },
    published: { type: Boolean, default: false },
    amenities: { type: [String], default: [] },
    blocks: { type: Array, default: [] },
    ...softDelete,
  },
  { collection: "properties" },
);

const unitSchema = new mongoose.Schema(
  {
    propertyId: { type: String, required: true },
    ownerId: { type: String, required: true },
    blockId: { type: String, default: "" },
    blockName: { type: String, default: "" },
    floorId: { type: String, default: "" },
    floorLevel: { type: Number, default: 0 },
    name: { type: String, required: true },
    rentAmount: { type: Number, default: 0 },
    status: { type: String, default: "available" },
    ...softDelete,
  },
  { collection: "units" },
);

const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    propertyId: { type: String, required: true },
    ownerId: { type: String, required: true },
    unitId: { type: String, default: "" },
    userId: { type: String, default: "" },
    status: { type: String, default: "active" },
    ...softDelete,
  },
  { collection: "tenants" },
);

const leaseSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true },
    propertyId: { type: String, required: true },
    ownerId: { type: String, required: true },
    unitId: { type: String, default: "" },
    rentAmount: { type: Number, default: 0 },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    status: { type: String, default: "active" },
    ...softDelete,
  },
  { collection: "leases" },
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
    status: { type: String, default: "active" },
    startsAt: { type: Date, default: Date.now },
    endsAt: { type: Date, default: null },
    grantedByUserId: { type: String, required: true },
    grantedAt: { type: Date, default: Date.now },
    acceptedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revokedByUserId: { type: String, default: "" },
    reason: { type: String, default: "" },
    source: { type: String, default: "system" },
  },
  { collection: "managementassignments" },
);

const propertyTypeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { collection: "propertytypes" },
);

async function main() {
  await mongoose.connect(mongoUri!, {
    bufferCommands: false,
    maxPoolSize: 10,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
  });

  console.log("⚠️  Wiping all collections...");
  const db = mongoose.connection.db as any;
  const collections = await db.listCollections().toArray();
  for (const c of collections) {
    await db.collection(c.name).deleteMany({});
  }
  console.log(`✅ Wiped ${collections.length} collections.`);

  const User = mongoose.model("SeedUser", userSchema);
  const Property = mongoose.model("SeedProperty", propertySchema);
  const Unit = mongoose.model("SeedUnit", unitSchema);
  const Tenant = mongoose.model("SeedTenant", tenantSchema);
  const Lease = mongoose.model("SeedLease", leaseSchema);
  const Assignment = mongoose.model("SeedAssignment", assignmentSchema);
  const PropertyType = mongoose.model("SeedPropertyType", propertyTypeSchema);

  const password = await bcrypt.hash("Password123!", 12);

  // system-admin (bootstrap)
  const sysAdmin = await User.create({
    name: "System Admin",
    email: "sysadmin@keja.test",
    passwordHash: password,
    role: "system-admin",
    isVerified: true,
    isActive: true,
  });

  const admin = await User.create({
    name: "Portfolio Admin",
    email: "admin@keja.test",
    passwordHash: password,
    role: "admin",
    isVerified: true,
    isActive: true,
  });
  const adminId = String(admin._id);

  const custodian = await User.create({
    name: "Custodian One",
    email: "custodian@keja.test",
    passwordHash: password,
    role: "custodian",
    managedByOwnerId: adminId,
    isVerified: true,
    isActive: true,
  });
  const custodianId = String(custodian._id);

  const caretaker = await User.create({
    name: "Caretaker One",
    email: "caretaker@keja.test",
    passwordHash: password,
    role: "caretaker",
    managedByOwnerId: adminId,
    privileges: [
      "create_property",
      "edit_property",
      "delete_assigned_property",
      "manage_units",
      "manage_tenants",
      "process_move_requests",
      "manage_invoices",
      "manage_complaints",
      "manage_announcements",
      "send_messages",
      "manage_documents",
    ],
    isVerified: true,
    isActive: true,
  });
  const caretakerId = String(caretaker._id);

  const tenantUser = await User.create({
    name: "Tenant One",
    email: "tenant@keja.test",
    passwordHash: password,
    role: "tenant",
    isVerified: true,
    isActive: true,
  });
  const tenantUserId = String(tenantUser._id);

  // property types
  await PropertyType.insertMany([
    { key: "apartment", label: "Apartment", isActive: true },
    { key: "house", label: "House", isActive: true },
    { key: "studio", label: "Studio", isActive: true },
  ]);

  const property = await Property.create({
    title: "Sunrise Apartments",
    location: "Nairobi",
    price: 50000,
    beds: 2,
    baths: 1,
    type: "apartment",
    ownerId: adminId,
    createdById: adminId,
    caretakerIds: [caretakerId],
    custodianIds: [custodianId],
    published: true,
    amenities: [],
    blocks: [],
  });
  const propertyId = String(property._id);

  const unit = await Unit.create({
    propertyId,
    ownerId: adminId,
    blockId: "",
    blockName: "Main",
    floorId: "",
    floorLevel: 0,
    name: "Unit 1A",
    rentAmount: 25000,
    status: "available",
  });
  const unitId = String(unit._id);

  const tenant = await Tenant.create({
    name: "Tenant One",
    email: "tenant@keja.test",
    phone: "",
    propertyId,
    ownerId: adminId,
    unitId,
    userId: tenantUserId,
    status: "active",
  });
  const tenantId = String(tenant._id);

  await Lease.create({
    tenantId,
    propertyId,
    ownerId: adminId,
    unitId,
    rentAmount: 25000,
    startDate: new Date(),
    endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    status: "active",
  });

  const now = new Date();
  const adminPerms = [
    "property:read",
    "property:edit",
    "property:delete",
    "unit:read",
    "unit:manage",
    "tenant:read",
    "tenant:manage",
    "invoice:read-own",
    "invoice:manage",
    "invoice:mark-paid",
    "invoice:generate",
    "complaint:read",
    "complaint:manage",
    "announcement:read",
    "announcement:manage",
    "document:read-own",
    "document:manage",
    "assignment:read",
    "assignment:manage",
    "chat:read",
    "chat:send",
    "move-request:read",
    "move-request:manage",
    "search:read",
    "dashboard:read",
  ];
  const custodianPerms = [
    "property:read",
    "unit:read",
    "tenant:read",
    "tenant:manage",
    "invoice:read-own",
    "invoice:manage",
    "complaint:read",
    "complaint:manage",
    "announcement:read",
    "announcement:manage",
    "document:read-own",
    "document:manage",
    "assignment:read",
    "chat:read",
    "chat:send",
    "search:read",
    "dashboard:read",
  ];
  const caretakerPerms = [
    "property:read",
    "unit:read",
    "unit:manage",
    "tenant:read",
    "tenant:manage",
    "invoice:read-own",
    "complaint:read",
    "complaint:manage",
    "announcement:read",
    "announcement:manage",
    "document:read-own",
    "document:manage",
    "assignment:read",
    "chat:read",
    "chat:send",
    "search:read",
    "dashboard:read",
  ];

  await Assignment.insertMany([
    {
      principalUserId: adminId,
      accessRole: "admin",
      scopeType: "property",
      propertyId,
      blockId: "",
      unitId: "",
      permissions: adminPerms,
      status: "active",
      startsAt: now,
      endsAt: null,
      grantedByUserId: adminId,
      grantedAt: now,
      acceptedAt: now,
      source: "system",
      reason: "Seed",
    },
    {
      principalUserId: custodianId,
      accessRole: "custodian",
      scopeType: "property",
      propertyId,
      blockId: "",
      unitId: "",
      permissions: custodianPerms,
      status: "active",
      startsAt: now,
      endsAt: null,
      grantedByUserId: adminId,
      grantedAt: now,
      acceptedAt: now,
      source: "system",
      reason: "Seed",
    },
    {
      principalUserId: caretakerId,
      accessRole: "caretaker",
      scopeType: "property",
      propertyId,
      blockId: "",
      unitId: "",
      permissions: caretakerPerms,
      status: "active",
      startsAt: now,
      endsAt: null,
      grantedByUserId: adminId,
      grantedAt: now,
      acceptedAt: now,
      source: "system",
      reason: "Seed",
    },
  ]);

  console.log("\n✅ Reseed complete.");
  console.log("Credentials (password: Password123!):");
  console.log("  system-admin:", sysAdmin.email);
  console.log("  admin:       ", admin.email);
  console.log("  custodian:   ", custodian.email);
  console.log("  caretaker:   ", caretaker.email);
  console.log("  tenant:      ", tenantUser.email);
  console.log("Property:", propertyId, "| Unit:", unitId, "| Tenant:", tenantId);

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
