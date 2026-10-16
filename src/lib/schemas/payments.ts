import { z } from "zod";
import { DARAJA_ENVIRONMENTS } from "@/lib/payments/methods";
import { hex24 } from "./lease";

/** Paystack references are `KY-<objectid>-<hex>`; callback query params echo them unencoded-safe. */
export const paymentReference = z.string().regex(/^[A-Za-z0-9.\-=]+$/);

/**
 * Webhook envelope validated after HMAC verification. `amount` is coerced to
 * an integer because Paystack may serialize it as a decimal-carrying string.
 */
export const paystackWebhookEnvelope = z.object({
  event: z.string(),
  data: z.object({
    reference: z.string(),
    status: z.string().optional(),
    amount: z.coerce.number().int().optional(),
    currency: z.string().optional(),
    channel: z.string().optional(),
    paid_at: z.string().nullable().optional(),
  }),
});

// The tenant cannot influence the charge amount — the server derives the
// remaining balance. An unknown-key body (including a client `amount`) is
// stripped by the default object behavior, not rejected.
export const paystackInitiateInput = z.object({});

export const paystackInitiateParams = z.object({ id: z.string().regex(hex24) });

export const paystackStatusQuery = z.object({ reference: paymentReference });

export type PaystackWebhookEnvelope = z.infer<typeof paystackWebhookEnvelope>;
export type PaystackInitiateInput = z.infer<typeof paystackInitiateInput>;
export type PaystackInitiateParams = z.infer<typeof paystackInitiateParams>;
export type PaystackStatusQuery = z.infer<typeof paystackStatusQuery>;

/**
 * Owner Daraja configuration. All fields optional so an owner can flip
 * `darajaEnabled` or update a single secret; omitted keys are left untouched
 * and empty strings clear a field. The route enforces completeness before the
 * M-Pesa method actually turns on.
 */
export const ownerPaymentConfigInput = z.object({
  darajaEnabled: z.boolean().optional(),
  daraja: z
    .object({
      environment: z.enum(DARAJA_ENVIRONMENTS).optional(),
      consumerKey: z.string().trim().max(200).optional(),
      consumerSecret: z.string().trim().max(200).optional(),
      passphrase: z.string().trim().max(200).optional(),
      shortcode: z.string().trim().max(20).optional(),
    })
    .optional(),
});

export type OwnerPaymentConfigInput = z.infer<typeof ownerPaymentConfigInput>;
