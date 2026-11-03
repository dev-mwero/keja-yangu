/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted stubs — vi.hoisted runs before vi.mock factories
// ---------------------------------------------------------------------------

const { billingAccountStub, unitStub, unitBillingAssignmentStub } = vi.hoisted(() => ({
  billingAccountStub: {
    find: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    exists: vi.fn(),
    create: vi.fn(),
  },
  unitStub: {
    find: vi.fn(),
    findById: vi.fn(),
    updateOne: vi.fn(),
  },
  unitBillingAssignmentStub: {
    find: vi.fn(),
    findOne: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/mongoose", () => ({ connectToDatabase: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/invoicing", () => ({ assertValidPeriod: vi.fn() }));
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
  billingFieldsFromAccount,
  getOrCreateBillingAccountForOwner,
  nextBillingAccountInvoiceNumber,
  resolveBillingAccountForLease,
  resolveBillingAccountForOwner,
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
// billingFieldsFromAccount
// ---------------------------------------------------------------------------

describe("billingFieldsFromAccount", () => {
  it("returns null for null/undefined input", () => {
    expect(billingFieldsFromAccount(null)).toBeNull();
    expect(billingFieldsFromAccount(undefined)).toBeNull();
  });

  it("maps account fields to denormalised invoice fields", () => {
    const account = {
      _id: "ba-1",
      ownerAdminId: "admin-1",
      legalEntityName: "Acme Ltd",
      invoicePrefix: "ACME",
    };
    const result = billingFieldsFromAccount(account);
    expect(result).toEqual({
      billingAccountId: "ba-1",
      billingAdminId: "admin-1",
      billingSnapshot: {
        legalEntityName: "Acme Ltd",
        invoicePrefix: "ACME",
      },
    });
  });

  it("defaults missing optional fields to empty strings", () => {
    const result = billingFieldsFromAccount({ _id: "ba-2" });
    expect(result?.billingAdminId).toBe("");
    expect(result?.billingSnapshot.legalEntityName).toBe("");
    expect(result?.billingSnapshot.invoicePrefix).toBe("");
  });
});

// ---------------------------------------------------------------------------
// resolveBillingAccountForLease
// ---------------------------------------------------------------------------

describe("resolveBillingAccountForLease", () => {
  it("resolves by billingAccountId first", async () => {
    const account = { _id: "ba-1", invoicePrefix: "X" };
    billingAccountStub.findOne.mockResolvedValue(null); // owner fallback
    // loadBillingAccountLookup will query BillingAccount.find for explicit IDs
    billingAccountStub.find = vi.fn().mockReturnValue({
      lean: () => Promise.resolve([account]),
    });
    unitStub.find = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: () => Promise.resolve([]) }),
    });
    unitBillingAssignmentStub.find = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: () => Promise.resolve([]) }),
    });

    const result = await resolveBillingAccountForLease({
      billingAccountId: "ba-1",
      ownerId: "o-1",
    });
    expect(result).toEqual(account);
  });
});

// ---------------------------------------------------------------------------
// resolveBillingAccountForOwner
// ---------------------------------------------------------------------------

describe("resolveBillingAccountForOwner", () => {
  it("finds an owner's active account", async () => {
    const account = { _id: "ba-1", ownerAdminId: "o-1" };
    billingAccountStub.findOne.mockReturnValue({ lean: () => Promise.resolve(account) });

    const result = await resolveBillingAccountForOwner("o-1");
    expect(result).toEqual(account);
    expect(billingAccountStub.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ ownerAdminId: "o-1", status: "active" }),
    );
  });

  it("returns null when no account exists", async () => {
    billingAccountStub.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    const result = await resolveBillingAccountForOwner("o-missing");
    expect(result).toBeNull();
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
