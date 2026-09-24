/** @vitest-environment node */
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCheckout,
  PaymentProviderError,
  verify,
  verifyPaystackSignature,
} from "@/lib/payments/paystack";
import {
  buildPaymentReference,
  fromMinorUnits,
  mapChannelToMethod,
  PAYMENT_HOLD_MINUTES,
  toMinorUnits,
} from "@/lib/payments/provider";

const SECRET = "FAKE_PAYMENT_SECRET_FOR_TESTS";
const BODY =
  '{"event":"charge.success","data":{"reference":"KY-abc-12345678","status":"success","amount":2500000,"currency":"KES","channel":"card","paid_at":"2026-09-20T12:00:00.000Z"}}';
// createHmac("sha512", SECRET).update(BODY).digest("hex") — precomputed vector
const VALID_SIGNATURE =
  "31f1f82a1e6c8aa6961052c7a051af490c8610a8ffd6bac7bc181d7bf5e3647b8c1204c09ee21d5f5fff3c62fd1ca05e05e091b5a7ff2d469c3de12c3ad285f0";

function sign(body: string, secret = SECRET): string {
  return createHmac("sha512", secret).update(body).digest("hex");
}

describe("verifyPaystackSignature", () => {
  beforeEach(() => {
    process.env.PAYSTACK_SECRET_KEY = SECRET;
  });
  afterEach(() => {
    delete process.env.PAYSTACK_SECRET_KEY;
  });

  it("accepts a known HMAC-SHA512 vector", () => {
    expect(verifyPaystackSignature(BODY, VALID_SIGNATURE)).toBe(true);
  });

  it("rejects a signature minted over the original body when the body is tampered", () => {
    const tampered = BODY.replace("2500000", "2500001");
    expect(verifyPaystackSignature(tampered, VALID_SIGNATURE)).toBe(false);
  });

  it("rejects a signature minted with a different secret", () => {
    const other = sign(BODY, "ANOTHER_FAKE_SECRET");
    expect(verifyPaystackSignature(BODY, other)).toBe(false);
  });

  it("rejects malformed and truncated hex signatures", () => {
    expect(verifyPaystackSignature(BODY, "zzzz")).toBe(false);
    expect(verifyPaystackSignature(BODY, "g".repeat(128))).toBe(false);
    expect(verifyPaystackSignature(BODY, VALID_SIGNATURE.slice(0, 64))).toBe(false);
    expect(verifyPaystackSignature(BODY, "")).toBe(false);
  });

  it("rejects null or missing signatures", () => {
    expect(verifyPaystackSignature(BODY, null)).toBe(false);
  });

  it("fails closed when the secret is missing", () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    expect(verifyPaystackSignature(BODY, VALID_SIGNATURE)).toBe(false);
  });
});

describe("mapChannelToMethod", () => {
  it("maps every known channel and falls back to Other", () => {
    expect(mapChannelToMethod("card")).toBe("Card");
    expect(mapChannelToMethod("bank_transfer")).toBe("Bank");
    expect(mapChannelToMethod("mobile_money")).toBe("M-Pesa");
    expect(mapChannelToMethod("ussd")).toBe("Other");
    expect(mapChannelToMethod("qr")).toBe("Card");
    expect(mapChannelToMethod("apple_pay")).toBe("Other");
    expect(mapChannelToMethod(undefined)).toBe("Other");
    expect(mapChannelToMethod(null)).toBe("Other");
  });
});

describe("minor units", () => {
  it("converts with rounding precision", () => {
    expect(toMinorUnits(0.29)).toBe(29);
    expect(toMinorUnits(2500.1)).toBe(250010);
    expect(toMinorUnits(25000)).toBe(2500000);
    expect(fromMinorUnits(2500000)).toBe(25000);
    expect(fromMinorUnits(29)).toBe(0.29);
  });
});

describe("buildPaymentReference", () => {
  it("builds KY-<invoiceId>-<8 lowercase hex>", () => {
    const reference = buildPaymentReference("abc123");
    expect(reference).toMatch(/^KY-abc123-[0-9a-f]{8}$/);
    // Collisions are practically impossible; two references still differ in form.
    expect(buildPaymentReference("abc123").startsWith("KY-abc123-")).toBe(true);
  });
});

describe("createCheckout", () => {
  beforeEach(() => {
    process.env.PAYSTACK_SECRET_KEY = SECRET;
  });
  afterEach(() => {
    delete process.env.PAYSTACK_SECRET_KEY;
    vi.unstubAllGlobals();
  });

  function stubPaystackResponse(body: unknown, ok = true, status = 200) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok, status, json: vi.fn().mockResolvedValue(body) }),
    );
  }

  it("posts the derived minor-unit amount and returns the checkout URL", async () => {
    stubPaystackResponse({
      status: true,
      message: "Authorization URL created",
      data: {
        reference: "KY-inv-1a2b3c4d",
        access_code: "code1",
        authorization_url: "https://checkout.paystack.com/abc123",
      },
    });

    const result = await createCheckout({
      email: "tenant@keja.co",
      invoiceId: "inv123",
      amountMinor: 2500000,
      reference: "KY-inv123-1a2b3c4d",
      callbackUrl: "http://localhost:3000/dashboard/tenant/payments",
    });

    expect(result).toEqual({
      reference: "KY-inv-1a2b3c4d",
      authorizationUrl: "https://checkout.paystack.com/abc123",
      accessCode: "code1",
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.paystack.co/transaction/initialize");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRET}`);
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.amount).toBe("2500000");
    expect(body.currency).toBe("KES");
    expect(body.reference).toBe("KY-inv123-1a2b3c4d");
    expect(body.callback_url).toBe("http://localhost:3000/dashboard/tenant/payments");
    expect(body.metadata).toEqual({
      custom_fields: [{ variable_name: "invoice_id", value: "inv123" }],
    });
  });

  it("throws a typed error on a non-2xx response", async () => {
    stubPaystackResponse({ status: false, message: "Invalid key" }, false, 401);
    await expect(
      createCheckout({
        email: "tenant@keja.co",
        invoiceId: "inv123",
        amountMinor: 2500000,
        reference: "KY-inv123-1a2b3c4d",
        callbackUrl: "http://localhost:3000/dashboard/tenant/payments",
      }),
    ).rejects.toBeInstanceOf(PaymentProviderError);
  });

  it("throws when Paystack reports status:false", async () => {
    stubPaystackResponse({ status: false, message: "Reference already exists" });
    await expect(
      createCheckout({
        email: "tenant@keja.co",
        invoiceId: "inv123",
        amountMinor: 100,
        reference: "KY-inv123-dup",
        callbackUrl: "http://localhost:3000/dashboard/tenant/payments",
      }),
    ).rejects.toThrow("Reference already exists");
  });
});

describe("verify", () => {
  beforeEach(() => {
    process.env.PAYSTACK_SECRET_KEY = SECRET;
  });
  afterEach(() => {
    delete process.env.PAYSTACK_SECRET_KEY;
    vi.unstubAllGlobals();
  });

  it("normalizes the provider transaction payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          status: true,
          data: {
            status: "success",
            amount: 2500000,
            currency: "KES",
            channel: "card",
            paid_at: "2026-09-20T12:00:00.000Z",
          },
        }),
      }),
    );

    const result = await verify("KY-inv123-1a2b3c4d");
    expect(result).toEqual({
      status: "success",
      amountMinor: 2500000,
      currency: "KES",
      channel: "card",
      paidAt: new Date("2026-09-20T12:00:00.000Z"),
    });
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.paystack.co/transaction/verify/KY-inv123-1a2b3c4d");
    expect(init.method).toBe("GET");
  });

  it("throws on a failed verification response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ status: false, message: "Unknown reference" }),
      }),
    );
    await expect(verify("nope")).rejects.toThrow("Unknown reference");
  });
});

describe("paystack config guard", () => {
  beforeEach(() => {
    process.env.PAYSTACK_SECRET_KEY = SECRET;
  });
  afterEach(() => {
    delete process.env.PAYSTACK_SECRET_KEY;
  });

  it("exports the expected hold window constant", () => {
    expect(PAYMENT_HOLD_MINUTES).toBe(90);
  });
});
