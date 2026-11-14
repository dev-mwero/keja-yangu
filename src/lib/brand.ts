/**
 * Single source of truth for the product identity.
 *
 * Anything user-visible that names the product — metadata, email copy, support
 * addresses, manifest strings — should read from here rather than hard-coding a
 * literal, so the next rename is a one-file change. `src/lib/brand.test.ts`
 * guards against legacy names creeping back in.
 */
export const BRAND = {
  name: "Custodian Homes",
  shortName: "Custodian",
  domain: "custodianhomes.co.ke",
  url: "https://custodianhomes.co.ke",
  tagline: "Property Rentals & Tenant Management",
  emails: {
    info: "info@custodianhomes.co.ke",
    support: "support@custodianhomes.co.ke",
    noReply: "no-reply@custodianhomes.co.ke",
  },
} as const;

/** `Custodian Homes — Property Rentals & Tenant Management` */
export const BRAND_TITLE = `${BRAND.name} — ${BRAND.tagline}`;

/** `New page | Custodian Homes` metadata template. */
export const BRAND_TITLE_TEMPLATE = `%s | ${BRAND.name}`;

/**
 * Canonical deployment origin, without a trailing slash.
 *
 * Read at call time, not import time, so tests and scripts that set the
 * environment variable late still see it.
 *
 * Every URL the app hands out has to agree with the origin the browser sends
 * in the `Origin` header: verification and reset links, payment callbacks,
 * sitemap entries, and the CSRF origin check itself. A single trailing slash in
 * `NEXT_PUBLIC_APP_URL` produces `https://host//auth/verify` links and 403s
 * every mutation, so normalise the environment value here instead of trusting
 * the deployment to spell it correctly.
 */
export function getAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL || BRAND.url;
  return configured.replace(/\/+$/, "");
}
