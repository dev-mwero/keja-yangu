/**
 * Property identity and soft duplicate-detection helpers.
 *
 * Phase 2 — Canonical Inventory
 *
 * A property has a deterministic `identityHash` derived from its normalised
 * title and location. The hash is stored on the `Property` document and
 * indexed so a single query can surface potential duplicates before a new
 * property is saved.
 *
 * This is intentionally a *soft* signal — two properties may share a hash
 * legitimately (e.g. "Block A, Westlands" can mean different addresses). The
 * caller decides whether to block, warn or file a `PropertyClaim`.
 */

import { createHash } from "node:crypto";
import { Property } from "@/models/Property";
import { PropertyClaim } from "@/models/PropertyClaim";

/**
 * Compute a stable, case-insensitive identity hash from a property's title
 * and location. Normalisation: lower-case, collapse whitespace, strip
 * punctuation.
 */
export function computeIdentityHash(title: string, location: string): string {
  const normalise = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const canonical = `${normalise(title)}|${normalise(location)}`;
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

/**
 * Find live properties whose `identityHash` matches the given title + location.
 * Returns at most 10 candidates (enough for a warning UI, not a full listing).
 */
export async function findDuplicateCandidates(
  title: string,
  location: string,
  excludePropertyId?: string,
): Promise<{ _id: string; title: string; location: string }[]> {
  const hash = computeIdentityHash(title, location);
  const filter: Record<string, unknown> = {
    identityHash: hash,
    deletedAt: null,
    lifecycleState: "active",
  };
  if (excludePropertyId) {
    filter._id = { $ne: excludePropertyId };
  }
  const query = Property.find(filter);
  if (!query || typeof query.select !== "function") {
    return [];
  }
  const results = await query.select("title location").limit(10).lean();
  return (results ?? []).map((p: { _id: unknown; title?: unknown; location?: unknown }) => ({
    _id: String(p._id),
    title: String(p.title ?? ""),
    location: String(p.location ?? ""),
  }));
}

/**
 * Submit a `PropertyClaim` — an admin asserts that they have authority over
 * an existing property and requests system-admin review.
 *
 * Returns the created claim document.
 */
export async function createPropertyClaim(
  claimantUserId: string,
  propertyId: string,
  evidence: string,
) {
  return PropertyClaim.create({
    propertyId,
    claimantUserId,
    evidence,
    status: "pending",
  });
}
