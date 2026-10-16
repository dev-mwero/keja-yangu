import { INVOICE_METHODS, type InvoiceMethod } from "@/lib/invoicing";

/**
 * Payment-method registry (rent collection).
 *
 * Three methods describe how a tenant settles a rent invoice:
 *
 * - `manual`   — staff record cash, a direct M-Pesa send or a bank/other
 *                transfer by hand (amount + optional/required reference).
 * - `mpesa`    — tenants pay to the owner's Paybill/Till through Safaricom
 *                Daraja. Only available once that owner has provided Daraja
 *                credentials.
 * - `paystack` — tenants pay online through the platform's Paystack account.
 *                Only available once the platform Paystack keys are set.
 *
 * This module is pure (no Mongoose/Node imports) so both route handlers and
 * client components can share the vocabulary.
 */

export const PAYMENT_METHOD_IDS = ["manual", "mpesa", "paystack"] as const;
export type PaymentMethodId = (typeof PAYMENT_METHOD_IDS)[number];

/** Daraja (Safaricom) targets: sandbox for testing, production for live money. */
export const DARAJA_ENVIRONMENTS = ["sandbox", "production"] as const;
export type DarajaEnvironment = (typeof DARAJA_ENVIRONMENTS)[number];

export interface PaymentMethodMeta {
  id: PaymentMethodId;
  /** Human label for pickers and badges. */
  label: string;
  /** One-line description shown under the label. */
  description: string;
  /** True for methods the tenant completes in-app (M-Pesa, Paystack). */
  online: boolean;
}

export const PAYMENT_METHOD_META: Record<PaymentMethodId, PaymentMethodMeta> = {
  manual: {
    id: "manual",
    label: "Manual",
    description: "Record cash, a direct M-Pesa send, or a bank/other transfer yourself.",
    online: false,
  },
  mpesa: {
    id: "mpesa",
    label: "M-Pesa (Daraja)",
    description: "Tenants pay to your Paybill or Till number through Safaricom Daraja.",
    online: true,
  },
  paystack: {
    id: "paystack",
    label: "Paystack",
    description: "Tenants pay by card or bank transfer through the platform's Paystack account.",
    online: true,
  },
};

/**
 * The offline sub-methods a `manual` payment is recorded under. These are the
 * exact `INVOICE_METHODS` values persisted on the invoice (`method` field), so
 * the manual picker and the invoice ledger always agree.
 */
export const MANUAL_INVOICE_METHODS = INVOICE_METHODS;

/**
 * Cash needs no proof of payment; every other manual sub-method must carry a
 * transaction code/reference so the payment can be reconciled.
 */
export function manualMethodRequiresReference(method: InvoiceMethod): boolean {
  return method !== "Cash";
}

export interface PaymentMethodAvailability {
  /** True when the owner has enabled and fully configured Daraja. */
  darajaConfigured: boolean;
  /** True when the platform Paystack secret is present. */
  paystackConfigured: boolean;
}

/**
 * Resolves which methods are offered. Manual is always available; the online
 * methods appear only when their credentials exist — this is the single gate
 * the server and UI share so a method can never be shown without being usable.
 */
export function resolveAvailablePaymentMethods(
  availability: PaymentMethodAvailability,
): PaymentMethodId[] {
  const methods: PaymentMethodId[] = ["manual"];
  if (availability.darajaConfigured) methods.push("mpesa");
  if (availability.paystackConfigured) methods.push("paystack");
  return methods;
}

export function isPaymentMethodAvailable(
  id: PaymentMethodId,
  availability: PaymentMethodAvailability,
): boolean {
  return resolveAvailablePaymentMethods(availability).includes(id);
}

/**
 * Client-safe shape of an owner's payment configuration (secrets masked),
 * mirroring `serializeOwnerPaymentConfig`. Lives here (pure module) so client
 * components can import the type without pulling in Mongoose.
 */
export interface OwnerPaymentConfigView {
  daraja: {
    enabled: boolean;
    environment: DarajaEnvironment;
    shortcode: string;
    consumerKeyConfigured: boolean;
    consumerSecretConfigured: boolean;
    passphraseConfigured: boolean;
  };
  /** True when Daraja is enabled and every credential is present. */
  mpesaConfigured: boolean;
  availableMethods: PaymentMethodId[];
}
