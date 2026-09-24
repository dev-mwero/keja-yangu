import { z } from "zod";
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
