import { type InferSchemaType, model, models, Schema } from "mongoose";
import { DARAJA_ENVIRONMENTS, type DarajaEnvironment } from "@/lib/payments/methods";

/**
 * Per-owner payment configuration.
 *
 * Holds the Daraja (Safaricom M-Pesa) credentials that switch on the `mpesa`
 * payment method for a single owner's portfolio. Secrets (`consumerKey`,
 * `consumerSecret`, `passphrase`) are encrypted at rest with the shared field
 * cipher (see src/lib/crypto.ts) before they are written and are never returned
 * to clients — the settings API only exposes "configured" booleans.
 *
 * Paystack is platform-wide (env-configured), not per-owner, so it has no
 * columns here.
 */

export type { DarajaEnvironment };
export { DARAJA_ENVIRONMENTS };

export interface IDarajaConfig {
  environment: DarajaEnvironment;
  /** Daraja app consumer key (secret). */
  consumerKey: string;
  /** Daraja app consumer secret (secret). */
  consumerSecret: string;
  /** Lipa na M-Pesa online passkey (secret). */
  passphrase: string;
  /** Paybill or Till (store) number. */
  shortcode: string;
}

export interface IOwnerPaymentConfig {
  ownerId: string;
  /** Owner's on/off switch for the M-Pesa method, independent of creds present. */
  darajaEnabled: boolean;
  daraja: IDarajaConfig;
}

const darajaSchema = new Schema<IDarajaConfig>(
  {
    environment: { type: String, enum: [...DARAJA_ENVIRONMENTS], default: "sandbox" },
    consumerKey: { type: String, trim: true, default: "" },
    consumerSecret: { type: String, trim: true, default: "" },
    passphrase: { type: String, trim: true, default: "" },
    shortcode: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const ownerPaymentConfigSchema = new Schema<IOwnerPaymentConfig>(
  {
    ownerId: { type: String, required: true, unique: true },
    darajaEnabled: { type: Boolean, default: false },
    daraja: { type: darajaSchema, default: () => ({}) },
  },
  { timestamps: true },
);

export type OwnerPaymentConfigDocument = InferSchemaType<IOwnerPaymentConfig>;

export const OwnerPaymentConfig =
  models.OwnerPaymentConfig ||
  model<IOwnerPaymentConfig>("OwnerPaymentConfig", ownerPaymentConfigSchema);
