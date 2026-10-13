/**
 * Phone-number and identity helpers.
 *
 * Mobile and WhatsApp numbers are stored on the user document in E.164 form
 * (`+254712345678`). The UI collects them as a country dial-code plus a
 * national number, which {@link toE164} composes. Storing one canonical format
 * keeps search/notifications reliable and avoids free-text drift.
 */

export interface Country {
  code: string;
  dial: string;
  name: string;
}

/** Curated set — Kenya first so it is the default. Add more as needed. */
export const COUNTRIES: Country[] = [
  { code: "KE", dial: "+254", name: "Kenya" },
  { code: "UG", dial: "+256", name: "Uganda" },
  { code: "TZ", dial: "+255", name: "Tanzania" },
  { code: "RW", dial: "+250", name: "Rwanda" },
  { code: "BI", dial: "+257", name: "Burundi" },
  { code: "SS", dial: "+211", name: "South Sudan" },
  { code: "ET", dial: "+251", name: "Ethiopia" },
  { code: "NG", dial: "+234", name: "Nigeria" },
  { code: "ZA", dial: "+27", name: "South Africa" },
  { code: "GB", dial: "+44", name: "United Kingdom" },
  { code: "US", dial: "+1", name: "United States" },
];

export const DEFAULT_COUNTRY = COUNTRIES[0];

const E164_PATTERN = /^\+[1-9]\d{6,14}$/;
const NATIONAL_ID_PATTERN = /^[A-Z0-9]{4,32}$/;

/** Longest dial codes first so `+254` wins over a hypothetical `+25`. */
const DIAL_CODES_BY_LENGTH = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

export function findCountry(dial: string): Country | undefined {
  return COUNTRIES.find((country) => country.dial === dial);
}

export function isCountryDial(dial: string): boolean {
  return COUNTRIES.some((country) => country.dial === dial);
}

/** Strips everything but digits and drops a single national trunk `0`. */
export function nationalDigits(national: string): string {
  const digits = national.replace(/\D/g, "");
  return digits.replace(/^0+/, "");
}

/**
 * Composes an E.164 number from a dial code and a national number. Returns ""
 * when no national digits were supplied, so the caller can treat it as empty.
 */
export function toE164(dial: string, national: string): string {
  const digits = nationalDigits(national);
  if (!digits) return "";
  const prefix = dial.startsWith("+") ? dial : `+${dial}`;
  return `${prefix}${digits}`;
}

export function isValidE164(value: string): boolean {
  return E164_PATTERN.test(value);
}

/**
 * Splits a stored E.164 value back into its country and national number so the
 * UI can prefill the dial-code select and the number input. Returns null for an
 * empty or unrecognised value.
 */
export function parsePhone(value: string): { country: Country; national: string } | null {
  if (!value) return null;
  const match = DIAL_CODES_BY_LENGTH.find((country) => value.startsWith(country.dial));
  if (!match) return null;
  return { country: match, national: value.slice(match.dial.length) };
}

/** Human-friendly display, e.g. `+254 712 345 678`. Falls back to the raw value. */
export function formatPhone(value: string): string {
  const parsed = parsePhone(value);
  if (!parsed) return value;
  const groups = parsed.national.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
  return `${parsed.country.dial} ${groups}`;
}

/** Uppercases and strips separators so `12-345-678` and `12345678` compare equal. */
export function normalizeNationalId(value: string): string {
  return value.trim().replace(/[\s-]/g, "").toUpperCase();
}

export function isValidNationalId(value: string): boolean {
  return NATIONAL_ID_PATTERN.test(value);
}
