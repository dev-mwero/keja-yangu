import { describe, expect, it } from "vitest";
import { invoiceMarkPaidInput } from "@/lib/schemas/invoice";

describe("invoiceMarkPaidInput", () => {
  it("accepts a well-formed payment with amount, method, date, description and reference", () => {
    const result = invoiceMarkPaidInput.safeParse({
      amount: 12000,
      method: "Bank",
      paidAt: "2026-09-15T10:00:00.000Z",
      description: "September rent",
      reference: "BNK-42",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a zero or negative amount", () => {
    expect(invoiceMarkPaidInput.safeParse({ amount: 0 }).success).toBe(false);
    expect(invoiceMarkPaidInput.safeParse({ amount: -500 }).success).toBe(false);
  });

  it.each(["M-Pesa", "Card", "Bank", "Cheque", "Other"])(
    "requires a reference for the %s method",
    (method) => {
      const result = invoiceMarkPaidInput.safeParse({ method });
      expect(result.success).toBe(false);
    },
  );

  it("accepts a non-cash method once a reference is supplied", () => {
    expect(invoiceMarkPaidInput.safeParse({ method: "Cheque", reference: "CHQ-001" }).success).toBe(
      true,
    );
  });

  it("does not require a reference for cash", () => {
    expect(invoiceMarkPaidInput.safeParse({ method: "Cash" }).success).toBe(true);
  });
});
