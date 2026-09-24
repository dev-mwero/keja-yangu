/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatInvoiceNumber, nextInvoiceNumber } from "@/lib/invoice-numbering";
import { makeObjectId } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", async () => {
  const { getModelStubs: get } = await import("@/test/utils/model-mocks");
  return { User: get().user };
});

const { user } = getModelStubs();

const OWNER_ID = makeObjectId("owner");

describe("formatInvoiceNumber", () => {
  it("formats as INV-YYYYMM-NNNN zero-padded to four digits", () => {
    expect(formatInvoiceNumber("2026-09", 1)).toBe("INV-202609-0001");
    expect(formatInvoiceNumber("2026-09", 42)).toBe("INV-202609-0042");
    expect(formatInvoiceNumber("2026-09", 9999)).toBe("INV-202609-9999");
  });

  it("grows past 9999 without capping", () => {
    expect(formatInvoiceNumber("2026-09", 10000)).toBe("INV-202609-10000");
  });

  it("reflects the period in the sequence prefix", () => {
    expect(formatInvoiceNumber("2026-10", 1)).toBe("INV-202610-0001");
    expect(formatInvoiceNumber("2025-12", 7)).toBe("INV-202512-0007");
  });

  it("throws on a malformed period", () => {
    expect(() => formatInvoiceNumber("2026-13", 1)).toThrow(RangeError);
    expect(() => formatInvoiceNumber("nope", 1)).toThrow(RangeError);
  });
});

describe("nextInvoiceNumber", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("increments the per-owner per-period counter atomically", async () => {
    user.findOneAndUpdate.mockReturnValue(buildQuery({ invoiceCounters: { "2026-09": 3 } }));
    const number = await nextInvoiceNumber(OWNER_ID, "2026-09");
    expect(number).toBe("INV-202609-0003");
    expect(user.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: OWNER_ID },
      { $inc: { "invoiceCounters.2026-09": 1 } },
      { new: true, upsert: false },
    );
  });

  it("uses invoiceCounters.<period> — never a global or collection-wide counter", async () => {
    user.findOneAndUpdate.mockReturnValue(buildQuery({ invoiceCounters: { "2026-10": 9 } }));
    await nextInvoiceNumber(OWNER_ID, "2026-10");
    const update = user.findOneAndUpdate.mock.calls[0][1] as { $inc: Record<string, number> };
    expect(update.$inc).toEqual({ "invoiceCounters.2026-10": 1 });
    expect(Object.keys(update.$inc)).toHaveLength(1);
  });

  it("starts at 1 when the owner has no counter entry for the period", async () => {
    user.findOneAndUpdate.mockReturnValue(buildQuery({ invoiceCounters: {} }));
    expect(await nextInvoiceNumber(OWNER_ID, "2026-09")).toBe("INV-202609-0001");
  });

  it("falls back to 1 when the owner document is missing", async () => {
    user.findOneAndUpdate.mockReturnValue(buildQuery(null));
    expect(await nextInvoiceNumber(OWNER_ID, "2026-09")).toBe("INV-202609-0001");
  });

  it("each owner keeps an independent sequence", async () => {
    user.findOneAndUpdate.mockReturnValue(buildQuery({ invoiceCounters: { "2026-09": 1 } }));
    const other = makeObjectId("other");
    const first = await nextInvoiceNumber(OWNER_ID, "2026-09");
    expect(first).toBe("INV-202609-0001");
    await nextInvoiceNumber(other, "2026-09");
    const ownerFilter = user.findOneAndUpdate.mock.calls[0][0] as { _id: string };
    const otherFilter = user.findOneAndUpdate.mock.calls[1][0] as { _id: string };
    expect(ownerFilter._id).toBe(OWNER_ID);
    expect(otherFilter._id).toBe(other);
  });

  it("rejects a malformed period before touching any counter state", async () => {
    await expect(nextInvoiceNumber(OWNER_ID, "2026-13")).rejects.toThrow(RangeError);
    expect(user.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
