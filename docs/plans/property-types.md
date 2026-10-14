# Property Types — DB-backed, system-admin managed

## Goal

Replace the hardcoded property-type list (`apartment`, `villa`, `bungalow`) with a
database-backed, **global** list that the **system administrator** can extend
(add), rename (label), and activate/deactivate. Property records keep referencing
a type by a stable string **key**.

## Phase 1 — Synthesis (inline rulings)

Subagents are unavailable (account funding); the four Tier-1 analyses were run
inline and are recorded here.

- **Code analyst.** Hardcoded surfaces: `src/lib/property-types.ts`,
  `src/models/Property.ts` (enum), `src/app/api/v1/properties/route.ts` +
  `[id]/route.ts` (`z.enum(PROPERTY_TYPES)`), `src/components/dialogs/PropertyDialog.tsx`,
  `src/app/properties/page.tsx`, `src/app/dashboard/{owner,owner/reports,system-admin}/…`
  distributions, `src/data/properties.ts`.
- **Performance.** A tiny, rarely-changed lookup table. A short-TTL in-process
  cache (30 s) avoids a DB round-trip per property read/write; writes invalidate
  the cache.
- **DevOps.** No infra change. Seed happens lazily on first read and via an
  idempotent `scripts/seed-property-types.ts`. No migration needed: existing
  records already store the three keys.
- **Test.** Cover: public list ordering, admin-only create/update, duplicate key
  rejection, inactive types rejected on property create/update, and that the
  manager UI logic is exercised through the API.

No contradictions between the four analyses.

## Phase 2 — Inline Tier-2 rulings

- **`@database-architect`.** New `PropertyType` collection
  `{ key, label, order, active, deletedAt }`, unique index on `key`. Property
  documents continue to store the key as a plain string (no `ref`), so historical
  properties survive rename/deactivate. Deactivation is non-destructive; hard
  delete is intentionally **not** exposed in v1.
- **`@security-expert`.** Management is a system-wide, cross-tenant surface, so it
  gets a dedicated `property-type:manage` action granted **only** to
  `system-admin` (owners keep full control of their own portfolio but must not
  alter the global taxonomy). Public read is unauthenticated and returns only
  active types.

## Phase 3 — Design

- `PropertyType` model: `key` (stable slug, lower-kebab), `label`, `order`,
  `active`, `deletedAt`.
- `src/lib/property-type-store.ts`: cached `listPropertyTypes({ includeInactive })`,
  `getActivePropertyTypeKeys()`, `isActivePropertyTypeKey(key)`,
  `createPropertyType`, `updatePropertyType`, `invalidatePropertyTypeCache`,
  and idempotent `ensureSeeded()`.
- API:
  - `GET /api/v1/property-types` — public, active types ordered.
  - `GET /api/v1/property-types?all=1` — system-admin only (includes inactive).
  - `POST /api/v1/property-types` — create (admin).
  - `PATCH /api/v1/property-types/:id` — rename / reorder / activate (admin).
- Consumers (dialog, browse filter, dashboards) read the list dynamically.
- Soft-delete directive for the wider app (recycle bin / recovery) is tracked
  separately; this model carries a `deletedAt` field so it can adopt it later.
