import { describe, expect, it } from "vitest";
import {
  assertValidPeriod,
  canDelete,
  canMarkPaid,
  canVoid,
  computeDueDate,
  currentPeriod,
  deriveStatus,
  isLeaseActiveForPeriod,
  lastDayOf,
  periodRange,
  serializeInvoice,
} from "@/lib/invoicing";

describe("assertValidPeriod", () => {
  it("accepts well-formed YYYY-MM periods", () => {
    expect(() => assertValidPeriod("2026-01")).not.toThrow();
    expect(() => assertValidPeriod("2026-12")).not.toThrow();
  });

  it("rejects malformed periods", () => {
    expect(() => assertValidPeriod("2026-13")).toThrow(RangeError);
    expect(() => assertValidPeriod("2026-1")).toThrow(RangeError);
    expect(() => assertValidPeriod("26-09")).toThrow(RangeError);
    expect(() => assertValidPeriod("september")).toThrow(RangeError);
  });
});

describe("periodRange", () => {
  it("returns the inclusive UTC range of the calendar month", () => {
    const { start, end } = periodRange("2026-09");
    expect(start.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-30T23:59:59.999Z");
  });

  it("handles leap February", () => {
    expect(lastDayOf("2028-02")).toBe(29);
  });

  it("handles Gregorian century February (2100 is not a leap year)", () => {
    expect(lastDayOf("2100-02")).toBe(28);
  });

  it("rolls December over to January", () => {
    const { start, end } = periodRange("2025-12");
    expect(start.toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2025-12-31T23:59:59.999Z");
  });
});

describe("lastDayOf", () => {
  it("returns the day-of-month of the last day", () => {
    expect(lastDayOf("2026-04")).toBe(30);
    expect(lastDayOf("2026-02")).toBe(28);
    expect(lastDayOf("2026-10")).toBe(31);
  });
});

describe("computeDueDate", () => {
  it("always lands on the 5th of the month after the period, in UTC", () => {
    expect(computeDueDate("2026-01").toISOString()).toBe("2026-02-05T00:00:00.000Z");
    expect(computeDueDate("2026-09").toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });

  it("crosses the year border", () => {
    expect(computeDueDate("2026-12").toISOString()).toBe("2027-01-05T00:00:00.000Z");
  });
});

describe("isLeaseActiveForPeriod", () => {
  const periodStart = new Date(Date.UTC(2026, 8, 1));
  const periodEnd = new Date(Date.UTC(2026, 8, 30, 23, 59, 59, 999));

  it("includes a lease that started exactly at the period start", () => {
    expect(isLeaseActiveForPeriod({ startDate: periodStart }, periodStart, periodEnd)).toBe(true);
  });

  it("includes a lease whose endDate is exactly the period end (inclusive)", () => {
    expect(
      isLeaseActiveForPeriod(
        { startDate: periodStart, endDate: periodEnd },
        periodStart,
        periodEnd,
      ),
    ).toBe(true);
  });

  it("excludes a lease that ended before the period started", () => {
    const ended = new Date(Date.UTC(2026, 7, 31, 23, 59, 59, 999));
    expect(
      isLeaseActiveForPeriod(
        { startDate: new Date(Date.UTC(2026, 0, 1)), endDate: ended },
        periodStart,
        periodEnd,
      ),
    ).toBe(false);
  });

  it("includes an open-ended lease that started before the period", () => {
    expect(
      isLeaseActiveForPeriod(
        { startDate: new Date(Date.UTC(2026, 0, 1)), endDate: null },
        periodStart,
        periodEnd,
      ),
    ).toBe(true);
  });

  it("excludes a lease that starts after the period end", () => {
    expect(
      isLeaseActiveForPeriod({ startDate: new Date(Date.UTC(2026, 9, 1)) }, periodStart, periodEnd),
    ).toBe(false);
  });
});

describe("deriveStatus", () => {
  it("maps an overdue pending invoice by dueDate < now", () => {
    const invoice = { status: "pending", dueDate: new Date("2026-01-05T00:00:00.000Z") };
    expect(deriveStatus(invoice, new Date("2026-02-01T00:00:00.000Z"))).toBe("overdue");
  });

  it("keeps a pending invoice with dueDate exactly equal to now as pending", () => {
    const now = new Date("2026-02-05T00:00:00.000Z");
    const invoice = { status: "pending", dueDate: now };
    expect(deriveStatus(invoice, now)).toBe("pending");
  });

  it("keeps pending when the due date is still in the future", () => {
    const invoice = { status: "pending", dueDate: new Date("2026-02-05T00:00:00.000Z") };
    expect(deriveStatus(invoice, new Date("2026-01-01T00:00:00.000Z"))).toBe("pending");
  });

  it("never flips draft, paid or void", () => {
    const now = new Date("2026-02-01T00:00:00.000Z");
    expect(
      deriveStatus({ status: "draft", dueDate: new Date("2026-01-05T00:00:00.000Z") }, now),
    ).toBe("draft");
    expect(
      deriveStatus({ status: "paid", dueDate: new Date("2026-01-05T00:00:00.000Z") }, now),
    ).toBe("paid");
    expect(
      deriveStatus({ status: "void", dueDate: new Date("2026-01-05T00:00:00.000Z") }, now),
    ).toBe("void");
  });

  it("treats overdue only when pending (stored overdue never exists)", () => {
    const invoice = { status: "overdue", dueDate: new Date("2026-01-05T00:00:00.000Z") };
    expect(deriveStatus(invoice, new Date("2026-02-01T00:00:00.000Z"))).toBe("overdue");
  });
});

describe("serializeInvoice", () => {
  it("copies the doc and appends a derived status and overdue flag", () => {
    const doc = {
      _id: "i1",
      status: "pending" as const,
      dueDate: new Date("2026-01-05T00:00:00.000Z"),
      amountDue: 100,
    };
    const out = serializeInvoice(doc, new Date("2026-02-01T00:00:00.000Z"));
    expect(out).toEqual({
      _id: "i1",
      status: "overdue",
      dueDate: doc.dueDate,
      amountDue: 100,
      overdue: true,
    });
  });

  it("serializes a paid invoice unchanged with overdue false", () => {
    const doc = { status: "paid" as const, dueDate: new Date("2026-01-05T00:00:00.000Z") };
    const out = serializeInvoice(doc, new Date("2026-02-01T00:00:00.000Z"));
    expect(out.status).toBe("paid");
    expect(out.overdue).toBe(false);
  });
});

describe("currentPeriod", () => {
  it("formats a UTC date as YYYY-MM", () => {
    expect(currentPeriod(new Date("2026-09-24T00:00:00.000Z"))).toBe("2026-09");
    expect(currentPeriod(new Date("2026-01-01T00:00:00.000Z"))).toBe("2026-01");
    expect(currentPeriod(new Date("2026-12-31T23:59:59.000Z"))).toBe("2026-12");
  });
});

describe("state-machine guards", () => {
  it("canMarkPaid accepts draft, pending and derived overdue", () => {
    expect(canMarkPaid("draft")).toBe(true);
    expect(canMarkPaid("pending")).toBe(true);
    expect(canMarkPaid("overdue")).toBe(true);
    expect(canMarkPaid("paid")).toBe(false);
    expect(canMarkPaid("void")).toBe(false);
  });

  it("canVoid accepts draft, pending and derived overdue but never paid", () => {
    expect(canVoid("draft")).toBe(true);
    expect(canVoid("pending")).toBe(true);
    expect(canVoid("overdue")).toBe(true);
    expect(canVoid("paid")).toBe(false);
    expect(canVoid("void")).toBe(false);
  });

  it("canDelete accepts only draft", () => {
    expect(canDelete("draft")).toBe(true);
    expect(canDelete("pending")).toBe(false);
    expect(canDelete("overdue")).toBe(false);
    expect(canDelete("paid")).toBe(false);
    expect(canDelete("void")).toBe(false);
  });
});
