import { describe, expect, it } from "vitest";
import {
  buildInvoiceForLease,
  generateForPeriod,
  type InvoiceLease,
} from "@/lib/invoice-generation";
import { computeDueDate } from "@/lib/invoicing";

function lease(overrides: Partial<InvoiceLease> = {}): InvoiceLease {
  return {
    _id: "l1",
    tenantId: "t1",
    propertyId: "p1",
    ownerId: "o1",
    rentAmount: 25000,
    frequency: "monthly",
    startDate: new Date(Date.UTC(2026, 0, 1)),
    status: "active",
    ...overrides,
  };
}

describe("buildInvoiceForLease", () => {
  it("emits an unnumbered pending draft with zero amountPaid", () => {
    const draft = buildInvoiceForLease(lease(), "2026-09", new Date("2026-09-01T00:00:00.000Z"));
    expect(draft).toMatchObject({
      invoiceNumber: "",
      tenantId: "t1",
      propertyId: "p1",
      leaseId: "l1",
      ownerId: "o1",
      period: "2026-09",
      amountDue: 25000,
      amountPaid: 0,
      status: "pending",
    });
  });

  it("uses the lease rentAmount as amountDue", () => {
    const draft = buildInvoiceForLease(lease({ rentAmount: 45000 }), "2026-09", new Date());
    expect(draft.amountDue).toBe(45000);
  });

  it("assigns the lease id from _id", () => {
    const draft = buildInvoiceForLease(lease({ _id: "abc123" }), "2026-09", new Date());
    expect(draft.leaseId).toBe("abc123");
  });

  it("assigns the lease id from id when _id is absent", () => {
    const draft = buildInvoiceForLease(
      lease({ _id: undefined, id: "by-id" }),
      "2026-09",
      new Date(),
    );
    expect(draft.leaseId).toBe("by-id");
  });

  it("computes dueDate as the 5th of the next month and issues at now", () => {
    const now = new Date("2026-09-15T12:00:00.000Z");
    const draft = buildInvoiceForLease(lease(), "2026-09", now);
    expect(draft.dueDate.toISOString()).toBe(computeDueDate("2026-09").toISOString());
    expect(draft.issuedAt).toBe(now);
  });
});

describe("generateForPeriod", () => {
  it("returns an empty plan for no leases", () => {
    const result = generateForPeriod({
      leases: [],
      existing: [],
      period: "2026-09",
      now: new Date(),
    });
    expect(result.toCreate).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it("builds one draft per eligible lease-month", () => {
    const result = generateForPeriod({
      leases: [lease({ _id: "l1" }), lease({ _id: "l2", rentAmount: 12000 })],
      existing: [],
      period: "2026-09",
      now: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(result.toCreate).toHaveLength(2);
    expect(result.toCreate.map((d) => d.leaseId)).toEqual(["l1", "l2"]);
    expect(result.skipped).toEqual([]);
  });

  it("skips leases that already have an invoice for the period", () => {
    const result = generateForPeriod({
      leases: [lease({ _id: "l1" }), lease({ _id: "l2" })],
      existing: [{ leaseId: "l1" }],
      period: "2026-09",
      now: new Date(),
    });
    expect(result.toCreate).toHaveLength(1);
    expect(result.skipped).toEqual([{ leaseId: "l1", reason: "already-generated" }]);
  });

  it("is idempotent: a second run over the same existing set creates nothing", () => {
    const leases = [lease({ _id: "l1" })];
    const first = generateForPeriod({ leases, existing: [], period: "2026-09", now: new Date() });
    const second = generateForPeriod({
      leases,
      existing: first.toCreate.map((d) => ({ leaseId: d.leaseId })),
      period: "2026-09",
      now: new Date(),
    });
    expect(first.toCreate).toHaveLength(1);
    expect(second.toCreate).toEqual([]);
    expect(second.skipped).toEqual([{ leaseId: "l1", reason: "already-generated" }]);
  });

  it("skips non-monthly leases", () => {
    const result = generateForPeriod({
      leases: [lease({ _id: "l1", frequency: "quarterly" })],
      existing: [],
      period: "2026-09",
      now: new Date(),
    });
    expect(result.toCreate).toEqual([]);
    expect(result.skipped).toEqual([{ leaseId: "l1", reason: "non-monthly" }]);
  });

  it("skips leases with status ended", () => {
    const result = generateForPeriod({
      leases: [lease({ _id: "l1", status: "ended" })],
      existing: [],
      period: "2026-09",
      now: new Date(),
    });
    expect(result.skipped).toEqual([{ leaseId: "l1", reason: "ended" }]);
  });

  it("skips leases whose endDate is before the period start", () => {
    const result = generateForPeriod({
      leases: [lease({ _id: "l1", endDate: new Date(Date.UTC(2026, 7, 31)) })],
      existing: [],
      period: "2026-09",
      now: new Date(),
    });
    expect(result.skipped).toEqual([{ leaseId: "l1", reason: "ended" }]);
  });

  it("includes a lease whose endDate falls exactly on the period end", () => {
    const periodEnd = new Date(Date.UTC(2026, 8, 30, 23, 59, 59, 999));
    const result = generateForPeriod({
      leases: [lease({ _id: "l1", endDate: periodEnd })],
      existing: [],
      period: "2026-09",
      now: new Date(),
    });
    expect(result.toCreate).toHaveLength(1);
    expect(result.skipped).toEqual([]);
  });

  it("excludes a lease whose endDate is the day before the period start", () => {
    const before = new Date(Date.UTC(2026, 7, 31, 23, 59, 59, 999));
    const result = generateForPeriod({
      leases: [lease({ _id: "l1", endDate: before })],
      existing: [],
      period: "2026-09",
      now: new Date(),
    });
    expect(result.toCreate).toEqual([]);
    expect(result.skipped).toEqual([{ leaseId: "l1", reason: "ended" }]);
  });

  it("skips future leases that start after the period end", () => {
    const result = generateForPeriod({
      leases: [lease({ _id: "l1", startDate: new Date(Date.UTC(2026, 9, 1)) })],
      existing: [],
      period: "2026-09",
      now: new Date(),
    });
    expect(result.skipped).toEqual([{ leaseId: "l1", reason: "future" }]);
  });

  it("includes a lease that started exactly on the period start", () => {
    const periodStart = new Date(Date.UTC(2026, 8, 1));
    const result = generateForPeriod({
      leases: [lease({ _id: "l1", startDate: periodStart })],
      existing: [],
      period: "2026-09",
      now: new Date(),
    });
    expect(result.toCreate).toHaveLength(1);
  });

  it("handles a December to January rollover invoicing the January period", () => {
    const result = generateForPeriod({
      leases: [lease({ _id: "l1" })],
      existing: [],
      period: "2027-01",
      now: new Date(Date.UTC(2027, 0, 2)),
    });
    expect(result.toCreate).toHaveLength(1);
    expect(result.toCreate[0].period).toBe("2027-01");
    expect(result.toCreate[0].dueDate.toISOString()).toBe("2027-02-05T00:00:00.000Z");
  });

  it("invoices a leap February with a 5th-of-March due date", () => {
    const result = generateForPeriod({
      leases: [lease({ _id: "l1" })],
      existing: [],
      period: "2028-02",
      now: new Date(Date.UTC(2028, 1, 3)),
    });
    expect(result.toCreate).toHaveLength(1);
    expect(result.toCreate[0].dueDate.toISOString()).toBe("2028-03-05T00:00:00.000Z");
  });
});
