import { createHmac, timingSafeEqual } from "node:crypto";
import { getJwtSecret } from "@/lib/jwt";

/**
 * Safaricom Daraja (M-Pesa) adapter for owner-collected rent payments.
 *
 * Owners register their own Paybill/Till credentials (encrypted at rest, see
 * `OwnerPaymentConfig`); tenants pay the owner's shortcode via an STK push and
 * the result arrives on a per-owner callback URL. All amounts cross this
 * boundary as whole Kenyan shillings — M-Pesa does not carry cents — so callers
 * exchange `amountMinor` (cents) with {@link initiateStkPush} and receive
 * `amountMinor` back from callbacks.
 *
 * This module performs no persistence; it is the pure provider boundary. The
 * initiate route owns the `Payment` claim and the callback route owns
 * settlement.
 */

export const DARAJA_BASE_URLS = {
  sandbox: "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke",
} as const;

export type DarajaEnvironment = keyof typeof DARAJA_BASE_URLS;

export interface DarajaConfig {
  environment: DarajaEnvironment;
  consumerKey: string;
  consumerSecret: string;
  passphrase: string;
  shortcode: string;
}

const REQUEST_TIMEOUT_MS = 15_000;
const STK_TRANSACTION_TYPE = "CustomerPayBillOnline";
/** Refresh the cached OAuth token this many ms before its stated expiry. */
const TOKEN_SKEW_MS = 60_000;

/**
 * Typed error for every Daraja failure (bad credentials, rejected request,
 * timeout). Routes translate it into 502/503 instead of leaking provider
 * internals.
 */
export class MpesaProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MpesaProviderError";
  }
}

export function getDarajaBaseUrl(environment: DarajaEnvironment): string {
  return DARAJA_BASE_URLS[environment];
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();

/** Test-only: drops cached OAuth tokens so each test fetches a fresh one. */
export function resetDarajaTokenCache(): void {
  tokenCache.clear();
}

function tokenCacheKey(config: DarajaConfig): string {
  return `${config.environment}:${config.consumerKey}`;
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } catch (error) {
    if (error instanceof MpesaProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new MpesaProviderError("Daraja request timed out");
    }
    throw new MpesaProviderError("Daraja request failed");
  } finally {
    clearTimeout(timeout);
  }
}

interface OauthResponse {
  access_token?: string;
  expires_in?: string | number;
}

/**
 * Fetches (and caches) the OAuth bearer token. Cached per environment+consumer
 * key until shortly before expiry so a burst of STK pushes reuses one token.
 */
export async function getDarajaAccessToken(config: DarajaConfig): Promise<string> {
  const key = tokenCacheKey(config);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }

  const credentials = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString(
    "base64",
  );
  const url = `${getDarajaBaseUrl(config.environment)}/oauth/v1/generate?grant_type=client_credentials`;

  return withTimeout(async (signal) => {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Basic ${credentials}` },
      signal,
    });
    const json = (await res.json().catch(() => ({}))) as OauthResponse;
    if (!res.ok || !json.access_token) {
      throw new MpesaProviderError(`Daraja authentication failed (HTTP ${res.status})`);
    }
    const expiresInSec = Number(json.expires_in ?? 3599) || 3599;
    tokenCache.set(key, {
      accessToken: json.access_token,
      expiresAt: Date.now() + expiresInSec * 1000 - TOKEN_SKEW_MS,
    });
    return json.access_token;
  });
}

/** Daraja expects `YYYYMMDDHHmmss` in East Africa Time (UTC+3, no DST). */
export function darajaTimestamp(date: Date = new Date()): string {
  const eat = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${eat.getUTCFullYear()}${pad(eat.getUTCMonth() + 1)}${pad(eat.getUTCDate())}` +
    `${pad(eat.getUTCHours())}${pad(eat.getUTCMinutes())}${pad(eat.getUTCSeconds())}`
  );
}

/** `base64(shortcode + passphrase + timestamp)` — the STK request password. */
export function buildStkPassword(shortcode: string, passphrase: string, timestamp: string): string {
  return Buffer.from(`${shortcode}${passphrase}${timestamp}`).toString("base64");
}

/**
 * Normalizes a phone number to the `2547XXXXXXXX` MSISDN form Daraja requires.
 * Accepts E.164 (`+2547...`), a leading trunk `0`, or a bare national number.
 */
export function normalizeMpesaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits;
}

export interface StkPushInput {
  phone: string;
  amountMinor: number;
  accountReference: string;
  transactionDesc: string;
  callbackUrl: string;
}

export interface StkPushResult {
  merchantRequestId: string;
  checkoutRequestId: string;
  responseCode: string;
  responseDescription: string;
  customerMessage: string;
}

interface StkPushResponse {
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
  CustomerMessage?: string;
  errorMessage?: string;
}

/**
 * POST /mpesa/stkpush/v1/processrequest — prompts the tenant's phone. The
 * server-derived invoice balance is rounded to whole shillings; the client
 * never influences the amount.
 */
export async function initiateStkPush(
  config: DarajaConfig,
  input: StkPushInput,
): Promise<StkPushResult> {
  const accessToken = await getDarajaAccessToken(config);
  const timestamp = darajaTimestamp();
  const amount = Math.max(1, Math.round(input.amountMinor / 100));
  const phone = normalizeMpesaPhone(input.phone);
  if (!phone) {
    throw new MpesaProviderError("A valid M-Pesa phone number is required");
  }

  const url = `${getDarajaBaseUrl(config.environment)}/mpesa/stkpush/v1/processrequest`;
  return withTimeout(async (signal) => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: config.shortcode,
        Password: buildStkPassword(config.shortcode, config.passphrase, timestamp),
        Timestamp: timestamp,
        TransactionType: STK_TRANSACTION_TYPE,
        Amount: amount,
        PartyA: phone,
        PartyB: config.shortcode,
        PhoneNumber: phone,
        CallBackURL: input.callbackUrl,
        AccountReference: input.accountReference,
        TransactionDesc: input.transactionDesc,
      }),
      signal,
    });

    const json = (await res.json().catch(() => ({}))) as StkPushResponse;
    if (!res.ok || json.ResponseCode !== "0" || !json.CheckoutRequestID) {
      throw new MpesaProviderError(
        json.errorMessage ??
          json.ResponseDescription ??
          `Daraja STK push failed (HTTP ${res.status})`,
      );
    }

    return {
      merchantRequestId: json.MerchantRequestID ?? "",
      checkoutRequestId: json.CheckoutRequestID,
      responseCode: json.ResponseCode,
      responseDescription: json.ResponseDescription ?? "",
      customerMessage: json.CustomerMessage ?? "",
    };
  });
}

export interface StkQueryResult {
  resultCode: number;
  resultDesc: string;
}

interface StkQueryResponse {
  ResponseCode?: string;
  ResponseDescription?: string;
  ResultCode?: string | number;
  ResultDesc?: string;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * POST /mpesa/stkpushquery/v1/query — the server-side result fallback when a
 * callback is lost. Daraja returns HTTP 500 with `errorCode 500.001.1001` while
 * the prompt is still pending; that surfaces as a thrown error so the caller
 * can report "still pending" rather than a definitive result.
 */
export async function queryStkStatus(
  config: DarajaConfig,
  checkoutRequestId: string,
): Promise<StkQueryResult> {
  const accessToken = await getDarajaAccessToken(config);
  const timestamp = darajaTimestamp();
  const url = `${getDarajaBaseUrl(config.environment)}/mpesa/stkpushquery/v1/query`;

  return withTimeout(async (signal) => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: config.shortcode,
        Password: buildStkPassword(config.shortcode, config.passphrase, timestamp),
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      }),
      signal,
    });

    const json = (await res.json().catch(() => ({}))) as StkQueryResponse;
    if (!res.ok || json.ResultCode === undefined) {
      throw new MpesaProviderError(
        json.errorMessage ??
          json.ResponseDescription ??
          `Daraja STK query failed (HTTP ${res.status})`,
      );
    }

    return {
      resultCode: Number(json.ResultCode),
      resultDesc: json.ResultDesc ?? "",
    };
  });
}

export interface ParsedStkCallback {
  merchantRequestId: string;
  checkoutRequestId: string;
  resultCode: number;
  resultDesc: string;
  /** Whole shillings reported by Daraja, expressed back as minor units. */
  amountMinor?: number;
  receipt?: string;
  phone?: string;
  paidAt?: Date;
}

/** Parses a Daraja `TransactionDate` (`YYYYMMDDHHmmss`, EAT) into a UTC Date. */
export function parseDarajaDate(value: string | number | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length !== 14) return undefined;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6)) - 1;
  const day = Number(digits.slice(6, 8));
  const hour = Number(digits.slice(8, 10));
  const minute = Number(digits.slice(10, 12));
  const second = Number(digits.slice(12, 14));
  const date = new Date(Date.UTC(year, month, day, hour - 3, minute, second));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Normalizes the STK callback body. Daraja nests the payload under
 * `Body.stkCallback` and returns success metadata as a name/value `Item` list.
 * Returns null when the shape is unrecognisable (the caller acks regardless).
 */
export function parseStkCallback(body: unknown): ParsedStkCallback | null {
  const stk = (
    body as {
      Body?: {
        stkCallback?: {
          MerchantRequestID?: string;
          CheckoutRequestID?: string;
          ResultCode?: string | number;
          ResultDesc?: string;
          CallbackMetadata?: { Item?: Array<{ Name?: string; Value?: unknown }> };
        };
      };
    }
  )?.Body?.stkCallback;

  if (!stk?.CheckoutRequestID || stk.ResultCode === undefined) return null;

  const items = stk.CallbackMetadata?.Item ?? [];
  const byName = new Map<string, unknown>();
  for (const item of items) {
    if (item?.Name) byName.set(item.Name, item.Value);
  }

  const amount = byName.get("Amount");
  const receipt = byName.get("MpesaReceiptNumber");
  const phone = byName.get("PhoneNumber");

  return {
    merchantRequestId: stk.MerchantRequestID ?? "",
    checkoutRequestId: stk.CheckoutRequestID,
    resultCode: Number(stk.ResultCode),
    resultDesc: stk.ResultDesc ?? "",
    amountMinor: amount === undefined ? undefined : Math.round(Number(amount) * 100),
    receipt: receipt === undefined ? undefined : String(receipt),
    phone: phone === undefined ? undefined : String(phone),
    paidAt: parseDarajaDate(byName.get("TransactionDate") as string | number | undefined),
  };
}

function callbackSecret(): string {
  return process.env.MPESA_CALLBACK_SECRET?.trim() || getJwtSecret();
}

/**
 * Signs the callback path so only URLs we minted (and handed to Daraja) are
 * accepted. Daraja does not sign callbacks, and the CheckoutRequestID alone
 * already gates settlement, so this is defence in depth against forged POSTs.
 */
export function buildMpesaCallbackToken(ownerId: string): string {
  return createHmac("sha256", callbackSecret()).update(ownerId).digest("hex");
}

export function verifyMpesaCallbackToken(ownerId: string, token: string): boolean {
  if (!token) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(buildMpesaCallbackToken(ownerId), "hex");
  } catch {
    return false;
  }
  let provided: Buffer;
  try {
    provided = Buffer.from(token, "hex");
  } catch {
    return false;
  }
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(expected, provided);
}
