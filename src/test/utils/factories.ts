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
  userId?: string;
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

export type TestNotificationType =
  | "invoice:paid"
  | "invoice:overdue"
  | "lease:expiring"
  | "complaint:created"
  | "complaint:status-changed"
  | "chat:reply"
  | "announcement";

export interface TestNotification {
  _id: string;
  recipientUserId: string;
  recipientRole?: string;
  type: TestNotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  link: string;
  channels: string[];
  readAt?: Date;
  emailSentAt?: Date;
  dedupeKey: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export function makeNotification(overrides: Partial<TestNotification> = {}): TestNotification {
  return {
    _id: makeObjectId("notification"),
    recipientUserId: makeObjectId("user"),
    type: "invoice:paid",
    title: "Invoice paid",
    body: "Your payment was received.",
    data: {},
    link: "",
    channels: ["in-app"],
    dedupeKey: "",
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    ...overrides,
  };
}

export interface TestPayment {
  _id: string;
  provider: string;
  providerReference: string;
  invoiceId: string;
  tenantId: string;
  ownerId: string;
  propertyId: string;
  amountMinor: number;
  currency: string;
  status: string;
  authorizationUrl?: string;
  channel?: string;
  paidAt?: Date;
  initiatedAt: Date;
  expiresAt: Date;
  lastEvent?: string;
  rawEvent?: unknown;
  notes?: string[];
}

export function makePayment(overrides: Partial<TestPayment> = {}): TestPayment {
  return {
    _id: makeObjectId("payment"),
    provider: "paystack",
    providerReference: "KY-abc123-1a2b3c4d",
    invoiceId: makeObjectId("invoice"),
    tenantId: makeObjectId("tenant"),
    ownerId: makeObjectId("user"),
    propertyId: makeObjectId("prop"),
    amountMinor: 2500000,
    currency: "KES",
    status: "pending",
    initiatedAt: new Date("2026-09-20T10:00:00.000Z"),
    expiresAt: new Date("2026-09-20T11:30:00.000Z"),
    ...overrides,
  };
}

export interface TestComplaint {
  _id: string;
  tenantId: string;
  propertyId: string;
  ownerId: string;
  subject: string;
  category: "Maintenance" | "Noise" | "Billing" | "Security" | "Neighbours" | "Other";
  message: string;
  status: "open" | "in-progress" | "resolved";
  priority: "low" | "medium" | "high";
  resolution?: string;
  updatedById?: string;
  updatedByRole?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export function makeComplaint(overrides: Partial<TestComplaint> = {}): TestComplaint {
  return {
    _id: makeObjectId("complaint"),
    tenantId: makeObjectId("tenant"),
    propertyId: makeObjectId("prop"),
    ownerId: makeObjectId("user"),
    subject: "Loose bathroom tap",
    category: "Maintenance",
    message: "The bathroom tap is leaking.",
    status: "open",
    priority: "medium",
    createdAt: new Date("2026-09-01T08:00:00.000Z"),
    updatedAt: new Date("2026-09-01T08:00:00.000Z"),
    ...overrides,
  };
}

export interface TestChatThread {
  _id: string;
  tenantId: string;
  propertyId: string;
  ownerId: string;
  agentUserId: string;
  agentRole: "owner" | "caretaker";
  lastMessageAt: Date;
  lastMessageText: string;
  tenantLastReadAt?: Date;
  agentLastReadAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export function makeChatThread(overrides: Partial<TestChatThread> = {}): TestChatThread {
  return {
    _id: makeObjectId("thread"),
    tenantId: makeObjectId("tenant"),
    propertyId: makeObjectId("prop"),
    ownerId: makeObjectId("user"),
    agentUserId: makeObjectId("agent"),
    agentRole: "caretaker",
    lastMessageAt: new Date("2026-09-02T09:00:00.000Z"),
    lastMessageText: "Anytime. Water tanks are being cleaned Thursday.",
    tenantLastReadAt: new Date("2026-09-02T08:00:00.000Z"),
    agentLastReadAt: new Date("2026-09-02T09:00:00.000Z"),
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-02T09:00:00.000Z"),
    ...overrides,
  };
}

export interface TestChatMessage {
  _id: string;
  threadId: string;
  senderUserId: string;
  senderRole: "tenant" | "owner" | "caretaker";
  text: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export function makeChatMessage(overrides: Partial<TestChatMessage> = {}): TestChatMessage {
  return {
    _id: makeObjectId("message"),
    threadId: makeObjectId("thread"),
    senderUserId: makeObjectId("agent"),
    senderRole: "caretaker",
    text: "Anytime. Water tanks are being cleaned Thursday.",
    createdAt: new Date("2026-09-02T09:00:00.000Z"),
    updatedAt: new Date("2026-09-02T09:00:00.000Z"),
    ...overrides,
  };
}

export interface TestAnnouncement {
  _id: string;
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  ownerId: string;
  propertyId: string;
  pinned: boolean;
  audience: "all" | "tenants" | "staff";
  createdAt?: Date;
  updatedAt?: Date;
}

export function makeAnnouncement(overrides: Partial<TestAnnouncement> = {}): TestAnnouncement {
  return {
    _id: makeObjectId("announcement"),
    title: "Water tank cleaning — Thursday morning",
    body: "Water tanks will be cleaned this Thursday from 7:00 AM to 11:00 AM.",
    authorId: makeObjectId("user"),
    authorName: "John Kiprono",
    ownerId: makeObjectId("user"),
    propertyId: "",
    pinned: true,
    audience: "tenants",
    createdAt: new Date("2026-09-02T08:00:00.000Z"),
    updatedAt: new Date("2026-09-02T08:00:00.000Z"),
    ...overrides,
  };
}

export interface TestDocument {
  _id: string;
  name: string;
  category: "lease" | "invoice" | "utility" | "notice" | "inspection" | "policy";
  scope: "tenant" | "landlord" | "property";
  propertyId: string;
  tenantId: string;
  ownerId: string;
  uploadedById: string;
  uploadedByName: string;
  sizeLabel: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export function makeDocument(overrides: Partial<TestDocument> = {}): TestDocument {
  return {
    _id: makeObjectId("document"),
    name: "Lease agreement — Sunlit Studio",
    category: "lease",
    scope: "tenant",
    propertyId: makeObjectId("prop"),
    tenantId: makeObjectId("tenant"),
    ownerId: makeObjectId("user"),
    uploadedById: makeObjectId("user"),
    uploadedByName: "D8 Property Group",
    sizeLabel: "1.4 MB",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}
