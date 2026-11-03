/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock("@/lib/mongoose", () => ({ connectToDatabase: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/invoicing", () => ({ assertValidPeriod: vi.fn() }));

const { billingAccountStub, unitStub, unitBillingAssignmentStub } = vi.hoisted(() => ({
  billingAccountStub: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    exists: vi.fn(),
    create: vi.fn(),
  },
  unitStub: {
    findById: vi.fn(),
    updateOne: vi.fn(),
  },
  unitBillingAssignmentStub: {
    findOne: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock("@/models/BillingAccount", () => ({ BillingAccount: billingAccountStub }));
vi.mock("@/models/Unit", () => ({ Unit: unitStub }));
vi.mock("@/models/UnitBillingAssignment", () => ({
  UnitBillingAssignment: unitBillingAssignmentStub,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  assignBillingAccountToUnit,
  getOrCreateBillingAccountForOwner,
  nextBillingAccountInvoiceNumber,
  resolveBillingAccountForUnit,
  sanitizeInvoicePrefix,
} from "@/lib/billing-accounts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a chainable stub ending with `.lean()` resolving to `value`. */
function buildChain(value: unknown) {
  const chain = { select: vi.fn(), lean: vi.fn(() => Promise.resolve(value)) };
  chain.select.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// sanitizeInvoicePrefix
// ---------------------------------------------------------------------------

describe("sanitizeInvoicePrefix", () => {
  it("uppercases and strips special chars", () => {
    expect(sanitizeInvoicePrefix("abc-123")).toBe("ABC123");
  });

  it("truncates to 6 chars", () => {
    expect(sanitizeInvoicePrefix("ABCDEFGH")).toBe("ABCDEF");
  });

  it("falls back to INV when result is shorter than 2 chars", () => {
    expect(sanitizeInvoicePrefix("!")).toBe("INV");
    expect(sanitizeInvoicePrefix("")).toBe("INV");
  });

  it("keeps a 2-char prefix as-is", () => {
    expect(sanitizeInvoicePrefix("AB")).toBe("AB");
  });
});

// ---------------------------------------------------------------------------
// nextBillingAccountInvoiceNumber
// ---------------------------------------------------------------------------

describe("nextBillingAccountInvoiceNumber", () => {
  it("increments counter and returns formatted invoice number", async () => {
    const counters = new Map([["2025-01", 3]]);
    const account = { invoicePrefix: "ACME", invoiceCounters: counters };
    billingAccountStub.findOneAndUpdate.mockReturnValue(buildChain(account));

    const result = await nextBillingAccountInvoiceNumber("ba-1", "2025-01");

    expect(result.invoiceNumber).toBe("ACME-202501-0003");
    expect(result.prefix).toBe("ACME");
    expect(result.seq).toBe(3);
  });

  it("uses seq=1 when counter entry is missing", async () => {
    const account = { invoicePrefix: "INV", invoiceCounters: new Map() };
    billingAccountStub.findOneAndUpdate.mockReturnValue(buildChain(account));

    const result = await nextBillingAccountInvoiceNumber("ba-1", "2025-01");
    expect(result.seq).toBe(1);
    expect(result.invoiceNumber).toBe("INV-202501-0001");
  });

  it("throws when billing account is not found", async () => {
    billingAccountStub.findOneAndUpdate.mockReturnValue(buildChain(null));
    await expect(nextBillingAccountInvoiceNumber("missing", "2025-01")).rejects.toThrow(
      /Billing account missing not found/,
    );
  });
});

// ---------------------------------------------------------------------------
// getOrCreateBillingAccountForOwner
// ---------------------------------------------------------------------------

describe("getOrCreateBillingAccountForOwner", () => {
  it("returns an existing active billing account", async () => {
    const existing = { ownerAdminId: "owner-1", status: "active" };
    billingAccountStub.findOne.mockResolvedValue(existing);

    const result = await getOrCreateBillingAccountForOwner("owner-1");
    expect(result).toBe(existing);
    expect(billingAccountStub.create).not.toHaveBeenCalled();
  });

  it("creates a new billing account when none exists", async () => {
    billingAccountStub.findOne.mockResolvedValue(null);
    billingAccountStub.exists.mockResolvedValue(null); // prefix not taken
    const created = { ownerAdminId: "owner-1", invoicePrefix: "INV" };
    billingAccountStub.create.mockResolvedValue(created);

    const result = await getOrCreateBillingAccountForOwner("owner-1");
    expect(result).toBe(created);
    expect(billingAccountStub.create).toHaveBeenCalledWith(
      expect.objectContaining({ ownerAdminId: "owner-1", invoicePrefix: "INV" }),
    );
  });

  it("appends owner suffix when requested prefix is taken", async () => {
    billingAccountStub.findOne.mockResolvedValue(null);
    billingAccountStub.exists.mockResolvedValue({ _id: "existing" }); // prefix taken
    billingAccountStub.create.mockResolvedValue({});

    await getOrCreateBillingAccountForOwner("owner-XY", { invoicePrefix: "ACME" });

    // prefix should be truncated to 4 chars + last 2 of owner id → "ACME" + "XY"
    expect(billingAccountStub.create).toHaveBeenCalledWith(
      expect.objectContaining({ invoicePrefix: "ACMEXY" }),
    );
  });

  it("uses provided legalEntityName", async () => {
    billingAccountStub.findOne.mockResolvedValue(null);
    billingAccountStub.exists.mockResolvedValue(null);
    billingAccountStub.create.mockResolvedValue({});

    await getOrCreateBillingAccountForOwner("owner-1", { legalEntityName: "My Company Ltd" });
    expect(billingAccountStub.create).toHaveBeenCalledWith(
      expect.objectContaining({ legalEntityName: "My Company Ltd" }),
    );
  });
});

// ---------------------------------------------------------------------------
// resolveBillingAccountForUnit
// ---------------------------------------------------------------------------

describe("resolveBillingAccountForUnit", () => {
  it("returns null when unit is not found", async () => {
    unitStub.findById.mockReturnValue(buildChain(null));
    const result = await resolveBillingAccountForUnit("u-missing");
    expect(result).toBeNull();
  });

  it("resolves via denormalised unit.billingAccountId", async () => {
    unitStub.findById.mockReturnValue(buildChain({ billingAccountId: "ba-1", ownerId: "o-1" }));
    const account = { _id: "ba-1" };
    billingAccountStub.findOne.mockResolvedValue(account);

    const result = await resolveBillingAccountForUnit("u-1");
    expect(result).toBe(account);
    expect(billingAccountStub.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "ba-1" }),
    );
  });

  it("falls back to active UnitBillingAssignment when unit pointer is empty", async () => {
    unitStub.findById.mockReturnValue(buildChain({ billingAccountId: "", ownerId: "o-1" }));

    const assignmentChain = {
      select: vi.fn(),
      lean: vi.fn(() => Promise.resolve({ billingAccountId: "ba-2" })),
    };
    assignmentChain.select.mockReturnValue(assignmentChain);
    unitBillingAssignmentStub.findOne.mockReturnValue(assignmentChain);
    unitStub.updateOne.mockResolvedValue({});

    const account = { _id: "ba-2" };
    billingAccountStub.findOne.mockResolvedValue(account);

    const result = await resolveBillingAccountForUnit("u-1");
    expect(result).toBe(account);
    expect(unitStub.updateOne).toHaveBeenCalled(); // synced back
  });

  it("falls back to owner billing account when no assignment exists", async () => {
    unitStub.findById.mockReturnValue(buildChain({ billingAccountId: "", ownerId: "o-1" }));

    const assignmentChain = {
      select: vi.fn(),
      lean: vi.fn(() => Promise.resolve(null)),
    };
    assignmentChain.select.mockReturnValue(assignmentChain);
    unitBillingAssignmentStub.findOne.mockReturnValue(assignmentChain);

    const ownerAccount = { ownerAdminId: "o-1" };
    billingAccountStub.findOne.mockResolvedValue(ownerAccount);

    const result = await resolveBillingAccountForUnit("u-1");
    expect(result).toBe(ownerAccount);
    expect(billingAccountStub.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ ownerAdminId: "o-1" }),
    );
  });

  it("returns null when unit has no ownerId and no assignment", async () => {
    unitStub.findById.mockReturnValue(buildChain({ billingAccountId: "", ownerId: null }));

    const assignmentChain = {
      select: vi.fn(),
      lean: vi.fn(() => Promise.resolve(null)),
    };
    assignmentChain.select.mockReturnValue(assignmentChain);
    unitBillingAssignmentStub.findOne.mockReturnValue(assignmentChain);

    const result = await resolveBillingAccountForUnit("u-1");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// assignBillingAccountToUnit
// ---------------------------------------------------------------------------

describe("assignBillingAccountToUnit", () => {
  it("closes active assignments, creates new one, and syncs unit pointer", async () => {
    unitBillingAssignmentStub.updateMany.mockResolvedValue({ modifiedCount: 1 });
    unitBillingAssignmentStub.create.mockResolvedValue({});
    unitStub.updateOne.mockResolvedValue({});

    await assignBillingAccountToUnit("u-1", "ba-1", "admin-1", "manual assignment");

    expect(unitBillingAssignmentStub.updateMany).toHaveBeenCalledWith(
      { unitId: "u-1", status: "active" },
      { $set: { status: "ended", effectiveTo: expect.any(Date) } },
    );
    expect(unitBillingAssignmentStub.create).toHaveBeenCalledWith(
      expect.objectContaining({
        unitId: "u-1",
        billingAccountId: "ba-1",
        status: "active",
        assignedByUserId: "admin-1",
        reason: "manual assignment",
      }),
    );
    expect(unitStub.updateOne).toHaveBeenCalledWith(
      { _id: "u-1" },
      { $set: { billingAccountId: "ba-1" } },
    );
  });
});
