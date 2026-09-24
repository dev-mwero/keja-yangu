import type { CaretakerPrivilege, Role } from "@/lib/permissions";

const HEX_CHARS = "abcdef0123456789";

/**
 * Produces a deterministic, valid 24-hex ObjectId-compatible string from an
 * arbitrary token. Route handlers validate ids with `isValidObjectId`, so
 * factory ids must be 24 hex chars (never the short "o1"/"c1" mock ids used
 * client-side).
 */
export function makeObjectId(token: string): string {
  let out = "";
  for (let i = 0; i < 24; i += 1) {
    const idx = (token.charCodeAt(i % token.length) + i) % 16;
    out += HEX_CHARS[idx];
  }
  return out;
}

export interface TestUser {
  _id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  privileges: CaretakerPrivilege[];
  managedByOwnerId: string;
  passwordHash?: string;
  isVerified?: boolean;
}

export interface TestProperty {
  _id: string;
  title: string;
  type: "room" | "apartment" | "building";
  location: string;
  price: number;
  description: string;
  images: string[];
  amenities: string[];
  status: "available" | "occupied" | "maintenance";
  ownerId: string;
  caretakerIds: string[];
  createdById: string;
  beds: number;
  baths: number;
  area: number;
}

export interface TestTenant {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  propertyId: string;
  ownerId: string;
  status: "active" | "pending" | "rejected";
  joinedAt?: Date;
  notes?: string;
}

export function makeUser(overrides: Partial<TestUser> = {}): TestUser {
  return {
    _id: makeObjectId("user"),
    name: "Test Owner",
    email: "owner@keja.co",
    role: "owner",
    isActive: true,
    privileges: [],
    managedByOwnerId: "",
    ...overrides,
  };
}

export function makeProperty(overrides: Partial<TestProperty> = {}): TestProperty {
  return {
    _id: makeObjectId("prop"),
    title: "Sunset Villa",
    type: "apartment",
    location: "Kilimani, Nairobi",
    price: 45000,
    description: "A sunny apartment",
    images: [],
    amenities: [],
    status: "available",
    ownerId: makeObjectId("user"),
    caretakerIds: [],
    createdById: makeObjectId("user"),
    beds: 2,
    baths: 1,
    area: 60,
    ...overrides,
  };
}

export function makeTenant(overrides: Partial<TestTenant> = {}): TestTenant {
  return {
    _id: makeObjectId("tenant"),
    name: "Amina Otieno",
    email: "amina@keja.co",
    propertyId: makeObjectId("prop"),
    ownerId: makeObjectId("user"),
    status: "active",
    ...overrides,
  };
}

export interface TestLease {
  _id: string;
  tenantId: string;
  propertyId: string;
  ownerId: string;
  rentAmount: number;
  frequency: "monthly";
  startDate: Date;
  endDate?: Date | null;
  status: "active" | "ended";
  notes?: string;
}

export function makeLease(overrides: Partial<TestLease> = {}): TestLease {
  return {
    _id: makeObjectId("lease"),
    tenantId: makeObjectId("tenant"),
    propertyId: makeObjectId("prop"),
    ownerId: makeObjectId("user"),
    rentAmount: 25000,
    frequency: "monthly",
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    endDate: undefined,
    status: "active",
    ...overrides,
  };
}

export interface TestInvoice {
  _id: string;
  invoiceNumber: string;
  tenantId: string;
  propertyId: string;
  leaseId: string;
  ownerId: string;
  period: string;
  amountDue: number;
  amountPaid: number;
  status: "draft" | "pending" | "paid" | "void";
  dueDate: Date;
  issuedAt: Date;
  method?: string;
  notes?: string;
  paidAt?: Date;
  paidBy?: string;
  paidByRole?: string;
}

export function makeInvoice(overrides: Partial<TestInvoice> = {}): TestInvoice {
  return {
    _id: makeObjectId("invoice"),
    invoiceNumber: "INV-202609-0001",
    tenantId: makeObjectId("tenant"),
    propertyId: makeObjectId("prop"),
    leaseId: "",
    ownerId: makeObjectId("user"),
    period: "2026-09",
    amountDue: 25000,
    amountPaid: 0,
    status: "pending",
    dueDate: new Date("2026-10-05T00:00:00.000Z"),
    issuedAt: new Date("2026-09-01T00:00:00.000Z"),
    ...overrides,
  };
}
