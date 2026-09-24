import { randomBytes } from "node:crypto";
import type { InvoiceMethod } from "@/lib/invoicing";

export const PAYMENT_PROVIDERS = ["paystack"] as const;
export type PaymentProviderName = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_STATUSES = ["pending", "success", "failed", "abandoned"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** How long a pending checkout window stays valid before a tenant must re-initiate. */
export const PAYMENT_HOLD_MINUTES = 90;

/** KES is expressed as integer minor units (cents) at the provider boundary. */
export const MINOR_UNITS = 100;

export function toMinorUnits(major: number): number {
  return Math.round(major * MINOR_UNITS);
}

export function fromMinorUnits(minor: number): number {
  return minor / MINOR_UNITS;
}

export interface CreateCheckoutInput {
  email: string;
  invoiceId: string;
  amountMinor: number;
  reference: string;
  callbackUrl: string;
}

export interface CreateCheckoutResult {
  reference: string;
  authorizationUrl: string;
  accessCode?: string;
}

export interface VerifyResult {
  status: string;
  amountMinor: number;
  currency: string;
  channel?: string;
  paidAt?: Date;
}

/**
 * Contract every online-payment provider adapter satisfies. Signature
 * verification is a loose function (HMAC over the raw body) and webhook
 * envelope validation lives at the boundary where the trusted schema is known,
 * so the interface only declares what adapter exports implement.
 */
export interface PaymentProvider {
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
  verify(reference: string): Promise<VerifyResult>;
}

/**
 * Maps a provider channel to the offline `INVOICE_METHODS` vocabulary used by
 * the rest of the app. Unknown channels fall back to "Other"; the provider
 * name itself is deliberately NOT introduced into `INVOICE_METHODS` — the
 * provenance of an online payment lives on the `Payment` ledger row.
 */
const CHANNEL_TO_METHOD: Record<string, InvoiceMethod> = {
  card: "Card",
  bank_transfer: "Bank",
  mobile_money: "M-Pesa",
  ussd: "Other",
  qr: "Card",
};

export function mapChannelToMethod(channel?: string | null): InvoiceMethod {
  if (!channel) return "Other";
  return CHANNEL_TO_METHOD[channel] ?? "Other";
}

/**
 * Provider-scoped idempotency reference: `KY-<invoiceId>-<8 hex>`. 32 bits of
 * randomness is ample because the invoiceId prefix already namespaces the key.
 */
export function buildPaymentReference(invoiceId: string): string {
  const suffix = randomBytes(4).toString("hex");
  return `KY-${invoiceId}-${suffix}`;
}
