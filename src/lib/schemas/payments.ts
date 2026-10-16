import { z } from "zod";
import { DARAJA_ENVIRONMENTS } from "@/lib/payments/methods";
import { isValidE164 } from "@/lib/phone";
import { hex24 } from "./lease";

/**
 * A tenant payment reference: Paystack's `KY-<objectid>-<hex>` or Daraja's
 * `CheckoutRequestID` (alphanumeric with underscores). Callback query params
 * echo either unencoded-safe.
 */
export const paymentReference = z.string().regex(/^[A-Za-z0-9._\-=]+$/);

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

export const paymentStatusQuery = z.object({ reference: paymentReference });

export type PaystackWebhookEnvelope = z.infer<typeof paystackWebhookEnvelope>;
export type PaystackInitiateInput = z.infer<typeof paystackInitiateInput>;
export type PaystackInitiateParams = z.infer<typeof paystackInitiateParams>;
export type PaymentStatusQuery = z.infer<typeof paymentStatusQuery>;

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

// The tenant supplies only the paying phone number; the charge amount is the
// server-derived balance. E.164 keeps the value canonical for Daraja.
export const mpesaInitiateInput = z.object({
  phone: z.string().trim().refine(isValidE164, { message: "A valid phone number is required" }),
});

export const mpesaInitiateParams = z.object({ id: z.string().regex(hex24) });

/** Opaque path signed with `buildMpesaCallbackToken`; the token is a hex HMAC. */
export const mpesaCallbackParams = z.object({
  ownerId: z.string().regex(hex24),
  token: z.string().regex(/^[a-f0-9]{64}$/i),
});

/**
 * Permissive Daraja callback envelope. Daraja nests the payload under
 * `Body.stkCallback`; unknown keys are ignored and a malformed body is acked
 * rather than retried, so this schema documents the shape without gating it.
 */
export const mpesaCallbackEnvelope = z.object({
  Body: z.object({
    stkCallback: z.object({
      MerchantRequestID: z.string().optional(),
      CheckoutRequestID: z.string(),
      ResultCode: z.union([z.string(), z.number()]),
      ResultDesc: z.string().optional(),
      CallbackMetadata: z
        .object({
          Item: z
            .array(
              z.object({
                Name: z.string(),
                Value: z.union([z.string(), z.number()]).optional(),
              }),
            )
            .optional(),
        })
        .optional(),
    }),
  }),
});

export type MpesaInitiateInput = z.infer<typeof mpesaInitiateInput>;
export type MpesaInitiateParams = z.infer<typeof mpesaInitiateParams>;
export type MpesaCallbackParams = z.infer<typeof mpesaCallbackParams>;
export type MpesaCallbackEnvelope = z.infer<typeof mpesaCallbackEnvelope>;
