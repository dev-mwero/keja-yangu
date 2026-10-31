/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { computeInvoicePaymentSplit, computePaymentSplit } from "@/lib/payment-split";

const unit = (overrides: Record<string, unknown> = {}) => ({
  rentIncludesServiceCharge: false,
  rentSharePercent: 100,
  serviceChargeSharePercent: 0,
  ...overrides,
});

describe("computePaymentSplit", () => {
  it("non-inclusive: entire amount is rent, no service charge", () => {
    expect(computePaymentSplit(unit({ rentIncludesServiceCharge: false }), 2_500_000)).toEqual({
      rentMinor: 2_500_000,
      serviceChargeMinor: 0,
    });
  });

  it("inclusive 80/20 splits 25000 KES into rent 20000 + service 5000", () => {
    expect(
      computePaymentSplit(
        unit({
          rentIncludesServiceCharge: true,
          rentSharePercent: 80,
          serviceChargeSharePercent: 20,
        }),
        2_500_000,
      ),
    ).toEqual({ rentMinor: 2_000_000, serviceChargeMinor: 500_000 });
  });

  it("inclusive 33/67 splits so shares always sum to the paid total", () => {
    expect(
      computePaymentSplit(
        unit({
          rentIncludesServiceCharge: true,
          rentSharePercent: 33,
          serviceChargeSharePercent: 67,
        }),
        10_000,
      ),
    ).toEqual({ rentMinor: 3_300, serviceChargeMinor: 6_700 });
  });

  it("inclusive 100/0: all rent", () => {
    expect(
      computePaymentSplit(
        unit({
          rentIncludesServiceCharge: true,
          rentSharePercent: 100,
          serviceChargeSharePercent: 0,
        }),
        1_000_000,
      ),
    ).toEqual({ rentMinor: 1_000_000, serviceChargeMinor: 0 });
  });

  it("inclusive 0/100: all service charge", () => {
    expect(
      computePaymentSplit(
        unit({
          rentIncludesServiceCharge: true,
          rentSharePercent: 0,
          serviceChargeSharePercent: 100,
        }),
        1_000_000,
      ),
    ).toEqual({ rentMinor: 0, serviceChargeMinor: 1_000_000 });
  });

  it("zero amount splits to zeroes", () => {
    expect(computePaymentSplit(unit({ rentIncludesServiceCharge: true }), 0)).toEqual({
      rentMinor: 0,
      serviceChargeMinor: 0,
    });
  });

  it("odd amount rounding keeps rent + service charge equal to the total", () => {
    const result = computePaymentSplit(
      unit({
        rentIncludesServiceCharge: true,
        rentSharePercent: 30,
        serviceChargeSharePercent: 70,
      }),
      1_001,
    );
    expect(result.rentMinor + result.serviceChargeMinor).toBe(1_001);
  });
});

describe("computeInvoicePaymentSplit", () => {
  it("splits a full settlement using the invoice snapshot", () => {
    expect(
      computeInvoicePaymentSplit(
        { amountDue: 30000, rentAmount: 25000, serviceChargeAmount: 5000 },
        3_000_000,
      ),
    ).toEqual({ rentMinor: 2_500_000, serviceChargeMinor: 500_000 });
  });

  it("allocates a partial payment pro-rata and keeps the parts exact", () => {
    const result = computeInvoicePaymentSplit(
      { amountDue: 30000, rentAmount: 25000, serviceChargeAmount: 5000 },
      1_000_000,
    );
    expect(result.rentMinor).toBe(833_333);
    expect(result.serviceChargeMinor).toBe(166_667);
    expect(result.rentMinor + result.serviceChargeMinor).toBe(1_000_000);
  });

  it("treats a rent-only invoice as all rent", () => {
    expect(
      computeInvoicePaymentSplit(
        { amountDue: 25000, rentAmount: 25000, serviceChargeAmount: 0 },
        2_500_000,
      ),
    ).toEqual({ rentMinor: 2_500_000, serviceChargeMinor: 0 });
  });
});
