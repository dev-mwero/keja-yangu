/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildMpesaCallbackToken,
  buildStkPassword,
  type DarajaConfig,
  darajaTimestamp,
  getDarajaAccessToken,
  getDarajaBaseUrl,
  initiateStkPush,
  MpesaProviderError,
  normalizeMpesaPhone,
  parseDarajaDate,
  parseStkCallback,
  queryStkStatus,
  resetDarajaTokenCache,
  verifyMpesaCallbackToken,
} from "@/lib/payments/mpesa";

const CONFIG: DarajaConfig = {
  environment: "sandbox",
  consumerKey: "consumer-key",
  consumerSecret: "consumer-secret",
  passphrase: "passkey",
  shortcode: "174379",
};

afterEach(() => {
  vi.unstubAllGlobals();
  resetDarajaTokenCache();
  delete process.env.MPESA_CALLBACK_SECRET;
});

describe("darajaTimestamp", () => {
  it("renders YYYYMMDDHHmmss in East Africa Time (UTC+3)", () => {
    // 09:00 UTC is 12:00 in EAT.
    expect(darajaTimestamp(new Date("2026-09-20T09:00:00.000Z"))).toBe("20260920120000");
  });

  it("rolls the calendar day forward across the UTC midnight boundary", () => {
    // 22:30 UTC on the 19th is 01:30 EAT on the 20th.
    expect(darajaTimestamp(new Date("2026-09-19T22:30:00.000Z"))).toBe("20260920013000");
  });
});

describe("buildStkPassword", () => {
  it("base64-encodes shortcode + passphrase + timestamp", () => {
    const password = buildStkPassword("174379", "passkey", "20260920120000");
    expect(Buffer.from(password, "base64").toString("utf8")).toBe("174379passkey20260920120000");
  });
});

describe("normalizeMpesaPhone", () => {
  it("normalizes every accepted shape to 254...", () => {
    expect(normalizeMpesaPhone("+254712345678")).toBe("254712345678");
    expect(normalizeMpesaPhone("254712345678")).toBe("254712345678");
    expect(normalizeMpesaPhone("0712345678")).toBe("254712345678");
    expect(normalizeMpesaPhone("712345678")).toBe("254712345678");
    expect(normalizeMpesaPhone("011 234 5678")).toBe("254112345678");
  });

  it("returns an empty string when there are no digits", () => {
    expect(normalizeMpesaPhone("+")).toBe("");
  });
});

describe("getDarajaBaseUrl", () => {
  it("maps environments to Safaricom hosts", () => {
    expect(getDarajaBaseUrl("sandbox")).toBe("https://sandbox.safaricom.co.ke");
    expect(getDarajaBaseUrl("production")).toBe("https://api.safaricom.co.ke");
  });
});

describe("getDarajaAccessToken", () => {
  it("fetches a token with basic auth and caches it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ access_token: "token-123", expires_in: "3599" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await getDarajaAccessToken(CONFIG)).toBe("token-123");
    expect(await getDarajaAccessToken(CONFIG)).toBe("token-123");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    );
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("consumer-key:consumer-secret").toString("base64")}`,
    );
  });

  it("throws a typed error when authentication fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ errorMessage: "Bad credentials" }),
      }),
    );
    await expect(getDarajaAccessToken(CONFIG)).rejects.toBeInstanceOf(MpesaProviderError);
  });
});

function stubOauthThenPush(pushBody: unknown, pushOk = true, pushStatus = 200) {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ access_token: "token-123", expires_in: "3599" }),
    })
    .mockResolvedValueOnce({
      ok: pushOk,
      status: pushStatus,
      json: vi.fn().mockResolvedValue(pushBody),
    });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("initiateStkPush", () => {
  it("posts the derived whole-shilling amount and returns the checkout id", async () => {
    const fetchMock = stubOauthThenPush({
      MerchantRequestID: "merchant-1",
      CheckoutRequestID: "ws_CO_123",
      ResponseCode: "0",
      ResponseDescription: "Success",
      CustomerMessage: "Prompt sent",
    });

    const result = await initiateStkPush(CONFIG, {
      phone: "+254712345678",
      amountMinor: 2500000,
      accountReference: "INV-202609-0001",
      transactionDesc: "Rent 2026-09",
      callbackUrl: "https://app.keja.co/api/v1/payments/mpesa/callback/o/t",
    });

    expect(result).toMatchObject({
      merchantRequestId: "merchant-1",
      checkoutRequestId: "ws_CO_123",
      responseCode: "0",
    });

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-123");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.Amount).toBe(25000);
    expect(body.PhoneNumber).toBe("254712345678");
    expect(body.PartyA).toBe("254712345678");
    expect(body.PartyB).toBe("174379");
    expect(body.BusinessShortCode).toBe("174379");
    expect(body.AccountReference).toBe("INV-202609-0001");
    expect(String(body.Timestamp)).toHaveLength(14);
    expect(body.Password).toBe(buildStkPassword("174379", "passkey", String(body.Timestamp)));
  });

  it("throws a typed error when Daraja rejects the push", async () => {
    stubOauthThenPush({ ResponseCode: "1", ResponseDescription: "Insufficient balance" });
    await expect(
      initiateStkPush(CONFIG, {
        phone: "+254712345678",
        amountMinor: 100,
        accountReference: "INV",
        transactionDesc: "Rent",
        callbackUrl: "https://x/cb",
      }),
    ).rejects.toThrow("Insufficient balance");
  });
});

describe("queryStkStatus", () => {
  it("returns the parsed result code and description", async () => {
    const fetchMock = stubOauthThenPush({
      ResponseCode: "0",
      ResultCode: "0",
      ResultDesc: "The service request is processed successfully.",
    });

    const result = await queryStkStatus(CONFIG, "ws_CO_123");
    expect(result).toEqual({
      resultCode: 0,
      resultDesc: "The service request is processed successfully.",
    });
    const [url] = fetchMock.mock.calls[1] as [string];
    expect(url).toBe("https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query");
  });

  it("throws while the transaction is still being processed (no ResultCode)", async () => {
    stubOauthThenPush(
      { errorCode: "500.001.1001", errorMessage: "The transaction is being processed" },
      false,
      500,
    );
    await expect(queryStkStatus(CONFIG, "ws_CO_123")).rejects.toBeInstanceOf(MpesaProviderError);
  });
});

describe("parseDarajaDate", () => {
  it("parses an EAT timestamp into a UTC Date", () => {
    expect(parseDarajaDate("20260920120000")).toEqual(new Date("2026-09-20T09:00:00.000Z"));
  });

  it("returns undefined for malformed input", () => {
    expect(parseDarajaDate(undefined)).toBeUndefined();
    expect(parseDarajaDate("2026")).toBeUndefined();
  });
});

describe("parseStkCallback", () => {
  it("extracts amount, receipt, phone and paid time from a success callback", () => {
    const parsed = parseStkCallback({
      Body: {
        stkCallback: {
          MerchantRequestID: "merchant-1",
          CheckoutRequestID: "ws_CO_123",
          ResultCode: 0,
          ResultDesc: "The service request is processed successfully.",
          CallbackMetadata: {
            Item: [
              { Name: "Amount", Value: 25000 },
              { Name: "MpesaReceiptNumber", Value: "QK12ABC3XY" },
              { Name: "TransactionDate", Value: 20260920120000 },
              { Name: "PhoneNumber", Value: 254712345678 },
            ],
          },
        },
      },
    });

    expect(parsed).toMatchObject({
      checkoutRequestId: "ws_CO_123",
      resultCode: 0,
      amountMinor: 2500000,
      receipt: "QK12ABC3XY",
      phone: "254712345678",
    });
    expect(parsed?.paidAt).toEqual(new Date("2026-09-20T09:00:00.000Z"));
  });

  it("parses a failure callback with no metadata", () => {
    const parsed = parseStkCallback({
      Body: {
        stkCallback: {
          CheckoutRequestID: "ws_CO_123",
          ResultCode: 1032,
          ResultDesc: "Request cancelled by user",
        },
      },
    });
    expect(parsed).toMatchObject({ resultCode: 1032, amountMinor: undefined, receipt: undefined });
  });

  it("returns null for an unrecognisable payload", () => {
    expect(parseStkCallback({})).toBeNull();
    expect(parseStkCallback(null)).toBeNull();
  });
});

describe("mpesa callback token", () => {
  beforeEach(() => {
    process.env.MPESA_CALLBACK_SECRET = "callback-test-secret";
  });

  it("verifies a token minted for the same owner", () => {
    const owner = "owner-abc";
    const token = buildMpesaCallbackToken(owner);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyMpesaCallbackToken(owner, token)).toBe(true);
  });

  it("rejects a token minted for a different owner", () => {
    const token = buildMpesaCallbackToken("owner-a");
    expect(verifyMpesaCallbackToken("owner-b", token)).toBe(false);
  });

  it("rejects empty and malformed tokens", () => {
    expect(verifyMpesaCallbackToken("owner-a", "")).toBe(false);
    expect(verifyMpesaCallbackToken("owner-a", "nothex")).toBe(false);
  });
});
