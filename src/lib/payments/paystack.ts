import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  VerifyResult,
} from "@/lib/payments/provider";

const PAYSTACK_API = "https://api.paystack.co";
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Typed error for every Paystack integration failure (missing/legacy config,
 * rejected HTTP response, timeout). Routes translate it into 503/502 as
 * appropriate instead of leaking provider internals.
 */
export class PaymentProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentProviderError";
  }
}

/**
 * Fail-closed config guard. Returns the secret or throws; there is no dev
 * fallback secret on a payment path. Live (`sk_live_`) keys are refused — this
 * round ships test-mode only and a live secret silently settling test-money
 * would be worse than an outage.
 */
export function getPaystackSecret(): string {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) {
    throw new PaymentProviderError("PAYSTACK_SECRET_KEY is not configured");
  }
  if (secret.startsWith("sk_live_")) {
    throw new PaymentProviderError("Live Paystack keys are not supported in this release");
  }
  return secret;
}

/**
 * Verifies the Paystack `x-paystack-signature` header over the exact raw body
 * bytes. Constant-time comparison with a length guard first (timingSafeEqual
 * throws on mismatched lengths, and a malformed/truncated signature fails fast).
 */
export function verifyPaystackSignature(rawBody: string, signature: string | null): boolean {
  if (!signature || signature.length === 0) return false;

  let secret: string;
  try {
    secret = getPaystackSecret();
  } catch {
    return false;
  }

  const expected = createHmac("sha512", secret).update(rawBody, "utf8").digest();
  const provided = Buffer.from(signature, "hex");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(expected, provided);
}

async function paystackFetch(
  path: string,
  init: { method?: string; body?: unknown; signal: AbortSignal },
): Promise<Response> {
  const secret = getPaystackSecret();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secret}`,
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";

  return fetch(`${PAYSTACK_API}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
  });
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } catch (error) {
    if (error instanceof PaymentProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new PaymentProviderError("Paystack request timed out");
    }
    throw new PaymentProviderError("Paystack request failed");
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * POST /transaction/initialize — creates the hosted checkout. The amount is
 * always the server-derived integer minor-unit balance; the client never
 * influences it.
 */
export async function createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
  return withTimeout(async (signal) => {
    const res = await paystackFetch("/transaction/initialize", {
      method: "POST",
      body: {
        email: input.email,
        amount: String(input.amountMinor),
        currency: "KES",
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: {
          custom_fields: [{ variable_name: "invoice_id", value: String(input.invoiceId) }],
        },
      },
      signal,
    });

    const json = (await res.json()) as {
      status?: boolean;
      message?: string;
      data?: {
        reference?: string;
        authorization_url?: string;
        access_code?: string;
      };
    };

    if (!res.ok || json.status !== true || !json.data?.authorization_url) {
      throw new PaymentProviderError(
        json.message ?? `Paystack initialize failed (HTTP ${res.status})`,
      );
    }

    return {
      reference: json.data.reference ?? input.reference,
      authorizationUrl: json.data.authorization_url,
      accessCode: json.data.access_code,
    };
  });
}

interface PaystackVerifyData {
  status?: string;
  amount?: number;
  currency?: string;
  channel?: string;
  paid_at?: string;
}

/**
 * GET /transaction/verify/:reference — normalizes the provider response. Paystack
 * reports `amount` in the currency's subunit, which is already our minor unit.
 */
export async function verify(reference: string): Promise<VerifyResult> {
  return withTimeout(async (signal) => {
    const res = await paystackFetch(`/transaction/verify/${encodeURIComponent(reference)}`, {
      signal,
    });

    const json = (await res.json()) as {
      status?: boolean;
      message?: string;
      data?: PaystackVerifyData;
    };

    if (!res.ok || json.status !== true || !json.data) {
      throw new PaymentProviderError(json.message ?? `Paystack verify failed (HTTP ${res.status})`);
    }

    const data = json.data;
    return {
      status: data.status ?? "unknown",
      amountMinor: Number(data.amount ?? 0),
      currency: data.currency ?? "KES",
      channel: data.channel,
      paidAt: data.paid_at ? new Date(data.paid_at) : undefined,
    };
  });
}
