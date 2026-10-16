import { describe, expect, it } from "vitest";
import { INVOICE_METHODS } from "@/lib/invoicing";
import {
  isPaymentMethodAvailable,
  MANUAL_INVOICE_METHODS,
  manualMethodRequiresReference,
  PAYMENT_METHOD_IDS,
  PAYMENT_METHOD_META,
  resolveAvailablePaymentMethods,
} from "@/lib/payments/methods";

describe("payment method registry", () => {
  it("exposes manual, mpesa and paystack in a stable order", () => {
    expect(PAYMENT_METHOD_IDS).toEqual(["manual", "mpesa", "paystack"]);
  });

  it("has metadata for every method id, keyed and self-referencing correctly", () => {
    for (const id of PAYMENT_METHOD_IDS) {
      expect(PAYMENT_METHOD_META[id].id).toBe(id);
      expect(PAYMENT_METHOD_META[id].label.length).toBeGreaterThan(0);
    }
  });

  it("marks only the online methods as online", () => {
    expect(PAYMENT_METHOD_META.manual.online).toBe(false);
    expect(PAYMENT_METHOD_META.mpesa.online).toBe(true);
    expect(PAYMENT_METHOD_META.paystack.online).toBe(true);
  });

  it("reuses the invoice method enum for manual sub-methods", () => {
    expect(MANUAL_INVOICE_METHODS).toBe(INVOICE_METHODS);
  });
});

describe("manualMethodRequiresReference", () => {
  it("only exempts cash", () => {
    expect(manualMethodRequiresReference("Cash")).toBe(false);
    expect(manualMethodRequiresReference("M-Pesa")).toBe(true);
    expect(manualMethodRequiresReference("Card")).toBe(true);
    expect(manualMethodRequiresReference("Bank")).toBe(true);
    expect(manualMethodRequiresReference("Other")).toBe(true);
  });
});

describe("resolveAvailablePaymentMethods", () => {
  it("always offers manual", () => {
    expect(
      resolveAvailablePaymentMethods({ darajaConfigured: false, paystackConfigured: false }),
    ).toEqual(["manual"]);
  });

  it("adds mpesa when Daraja is configured", () => {
    expect(
      resolveAvailablePaymentMethods({ darajaConfigured: true, paystackConfigured: false }),
    ).toEqual(["manual", "mpesa"]);
  });

  it("adds paystack when the platform secret is set", () => {
    expect(
      resolveAvailablePaymentMethods({ darajaConfigured: false, paystackConfigured: true }),
    ).toEqual(["manual", "paystack"]);
  });

  it("offers all three when both are configured", () => {
    expect(
      resolveAvailablePaymentMethods({ darajaConfigured: true, paystackConfigured: true }),
    ).toEqual(["manual", "mpesa", "paystack"]);
  });
});

describe("isPaymentMethodAvailable", () => {
  const availability = { darajaConfigured: false, paystackConfigured: true };

  it("reflects the resolver output", () => {
    expect(isPaymentMethodAvailable("manual", availability)).toBe(true);
    expect(isPaymentMethodAvailable("paystack", availability)).toBe(true);
    expect(isPaymentMethodAvailable("mpesa", availability)).toBe(false);
  });
});
