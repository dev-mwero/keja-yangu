import { decryptField, encryptField } from "@/lib/crypto";
import {
  type DarajaEnvironment,
  type OwnerPaymentConfigView,
  resolveAvailablePaymentMethods,
} from "@/lib/payments/methods";
import { paystackConfigured } from "@/lib/payments/paystack";
import { OwnerPaymentConfig } from "@/models/OwnerPaymentConfig";

export type { OwnerPaymentConfigView };

/**
 * Owner payment configuration: read/merge/serialize helpers around the
 * `OwnerPaymentConfig` collection. The pure functions (availability, masking,
 * merge+encrypt) are exported separately so route tests can exercise them
 * without a database.
 */

const SECRET_KEYS = ["consumerKey", "consumerSecret", "passphrase"] as const;
const PLAIN_KEYS = ["environment", "shortcode"] as const;

export interface DarajaConfigLike {
  environment?: string;
  consumerKey?: string;
  consumerSecret?: string;
  passphrase?: string;
  shortcode?: string;
}

export interface OwnerPaymentConfigLike {
  darajaEnabled?: boolean;
  daraja?: DarajaConfigLike;
}

export interface DarajaConfigInput extends DarajaConfigLike {}

export interface OwnerPaymentConfigInput {
  darajaEnabled?: boolean;
  daraja?: DarajaConfigInput;
}

function isDarajaEnvironment(value: unknown): value is DarajaEnvironment {
  return value === "sandbox" || value === "production";
}

/** A config only enables M-Pesa when it is switched on and all four fields exist. */
export function hasDarajaCredentials(config: OwnerPaymentConfigLike | null | undefined): boolean {
  if (!config?.darajaEnabled) return false;
  const daraja = config.daraja;
  if (!daraja) return false;
  return Boolean(
    isDarajaEnvironment(daraja.environment) &&
      daraja.consumerKey &&
      daraja.consumerSecret &&
      daraja.passphrase &&
      daraja.shortcode,
  );
}

/**
 * Masks a stored config for the client: secrets collapse to `*Configured`
 * booleans, never values. `paystackOn` is injectable for deterministic tests.
 */
export function serializeOwnerPaymentConfig(
  config: OwnerPaymentConfigLike | null | undefined,
  paystackOn: boolean = paystackConfigured(),
): OwnerPaymentConfigView {
  const daraja = config?.daraja ?? {};
  const mpesaConfigured = hasDarajaCredentials(config);
  return {
    daraja: {
      enabled: Boolean(config?.darajaEnabled),
      environment: isDarajaEnvironment(daraja.environment) ? daraja.environment : "sandbox",
      shortcode: daraja.shortcode ?? "",
      consumerKeyConfigured: Boolean(daraja.consumerKey),
      consumerSecretConfigured: Boolean(daraja.consumerSecret),
      passphraseConfigured: Boolean(daraja.passphrase),
    },
    mpesaConfigured,
    availableMethods: resolveAvailablePaymentMethods({
      darajaConfigured: mpesaConfigured,
      paystackConfigured: paystackOn,
    }),
  };
}

/**
 * Builds the `$set` payload for an upsert: provided secrets are encrypted,
 * explicitly-empty strings clear a field, omitted keys are left untouched.
 * Never called with plaintext already in the DB.
 */
export function buildOwnerPaymentConfigSet(
  existing: OwnerPaymentConfigLike | null | undefined,
  input: OwnerPaymentConfigInput,
): Record<string, unknown> {
  const daraja: DarajaConfigLike = { ...(existing?.daraja ?? {}) };

  if (input.daraja) {
    for (const key of PLAIN_KEYS) {
      const value = input.daraja[key];
      if (value !== undefined) daraja[key] = value;
    }
    for (const key of SECRET_KEYS) {
      const value = input.daraja[key];
      if (value === undefined) continue;
      daraja[key] = value === "" ? "" : encryptField(value);
    }
  }

  const set: Record<string, unknown> = { daraja };
  if (input.darajaEnabled !== undefined) set.darajaEnabled = input.darajaEnabled;
  return set;
}

/**
 * Decrypts a stored Daraja config for an outbound Daraja call. Returns null
 * unless the config is complete. (Used by the M-Pesa flow added later.)
 */
export function resolveDarajaConfig(config: OwnerPaymentConfigLike | null | undefined): {
  environment: DarajaEnvironment;
  consumerKey: string;
  consumerSecret: string;
  passphrase: string;
  shortcode: string;
} | null {
  if (!hasDarajaCredentials(config)) return null;
  const daraja = config?.daraja;
  if (!daraja) return null;
  return {
    environment: daraja.environment as DarajaEnvironment,
    consumerKey: decryptField(daraja.consumerKey ?? ""),
    consumerSecret: decryptField(daraja.consumerSecret ?? ""),
    passphrase: decryptField(daraja.passphrase ?? ""),
    shortcode: daraja.shortcode ?? "",
  };
}

/** Loads an owner's config, or null when they have never configured one. */
export async function getOwnerPaymentConfig(
  ownerId: string,
): Promise<OwnerPaymentConfigLike | null> {
  return OwnerPaymentConfig.findOne({ ownerId }).lean();
}

/** Loads and masks an owner's config for the settings API. */
export async function getOwnerPaymentConfigView(ownerId: string): Promise<OwnerPaymentConfigView> {
  return serializeOwnerPaymentConfig(await getOwnerPaymentConfig(ownerId));
}

/** Upserts an owner's config (encrypting secrets) and returns the masked view. */
export async function saveOwnerPaymentConfig(
  ownerId: string,
  input: OwnerPaymentConfigInput,
): Promise<OwnerPaymentConfigView> {
  const existing = await getOwnerPaymentConfig(ownerId);
  const set = buildOwnerPaymentConfigSet(existing, input);
  await OwnerPaymentConfig.findOneAndUpdate(
    { ownerId },
    { $set: set, $setOnInsert: { ownerId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return getOwnerPaymentConfigView(ownerId);
}
