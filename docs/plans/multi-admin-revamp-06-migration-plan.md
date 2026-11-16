# Stage 1 — Migration Plan

**Status:** Approved migration approach; Phase 1 code authorized, production migration execution gated
**Date:** 2026-11-01; repository reconciliation: 2026-11-02
**Depends on:** `multi-admin-revamp-03-domain-model.md`

---

## 1. Migration goals

1. Move from a single `ownerId` portfolio to canonical property records with
   scoped admin assignments and per-unit billing responsibility.
2. Preserve every existing invoice, payment, lease, occupancy cache and
   historical number.
3. Keep the old system fully operational during a compatibility window.
4. Make every step idempotent, resumable, observable and reversible until the
   final cutover.
5. Avoid long-running locks, destructive updates and any dependency on MongoDB
   transactions.

Scale matters (recounted against Git-tracked source on 2026-11-02):

- 985 `ownerId` references under `src/`;
- 341 `"owner"` role literals across 127 TypeScript/TSX files;
- 173 test files and 73 API route handlers;
- 13 existing migration scripts.

This is a staged data and code migration, not a search-and-replace.

The assignment backfill and assignment/policy foundation already exist in code;
they do not constitute a completed migration. No `MigrationRun` model/runner,
staging apply report, financial checksum, or completed owner-to-admin migration
was found. Preserve and extend the existing work rather than duplicating it.

---

## 2. Non-negotiable constraints

| Constraint | Consequence |
| --- | --- |
| No destructive schema change in the first release | Legacy fields and collections remain readable |
| No transaction guarantee | Use idempotent upserts, conditional updates, compensation and checkpoints |
| Invoice/payment history is immutable | Never rewrite amounts, statuses, references or historical invoice numbers |
| Occupancy authority stays in `lib/allocation.ts` | Migrations do not write `Unit.tenantId`/status except through a verified reconciliation script |
| Public traffic cannot break | New public pages must be flag-gated and legacy pages kept as fallback |
| Owner terminology remains legally meaningful | Legal ownership, billing and management are separate records; no blind rename |
| Mongo index builds are operationally visible | Build in background, preflight duplicates, stop on failure |

---

## 3. Compatibility strategy

### 3.1 Additive first

Phase A adds:

- new collections;
- nullable/optional fields on existing collections;
- new indexes;
- dual-read/dual-write adapters;
- feature flags.

Phase B backfills and verifies.

Phase C flips reads route-family by route-family.

Phase D retires legacy fallbacks only after a full release cycle.

### 3.2 Source-of-truth rules during compatibility

| Data | Source of truth | Mirror |
| --- | --- | --- |
| Property physical record | Existing `Property` | New lifecycle/identity fields |
| Blocks/floors | Existing `Property.blocks[]` | New `Block` collection by same ids |
| Unit identity/occupancy | Existing `Unit` | New `billingAccountId` pointer only |
| Staff authority | New `ManagementAssignment`, falling back to legacy if absent | Legacy `ownerId`/arrays |
| Legal ownership | New `PropertyOwnership` | Legacy `Property.ownerId` |
| Billing issuer | New `BillingAccount`/`UnitBillingAssignment` | Legacy `ownerId` |
| Invoice/payment access | New `billingAccountId` when present | Legacy `ownerId` |
| Public listing | Legacy `Property.published/status` until flag flip | New `Listing` drafts |
| Broker/commission | New only | None |

If the new source is absent during the compatibility window, the adapter may
fall back to legacy. Once a route family is flipped, missing new data is a
hard error, not a silent fallback.

### 3.3 Dual-write rules

While the compatibility window is open:

- creating a property also creates the creator's admin assignment, billing
  account assignment and property lifecycle fields;
- creating/editing structure writes embedded blocks **and** mirrors them into
  `Block` by id;
- creating/editing a unit maintains the active `UnitBillingAssignment`;
- invoice generation writes `billingAccountId` and `billingAdminId` snapshot
  in addition to `ownerId`;
- payment settlement writes `billingAccountId` in addition to `ownerId`;
- service-fee writes write both `ownerId` and `billingAccountId`;
- assigning/removing a custodian or caretaker updates assignments and may
  still update legacy arrays until old UI is retired.

Every dual write must be checked by a reconciliation job. Drift is reported,
not auto-deleted.

---

## 4. Migration runner

Add a small `MigrationRun` collection (or equivalent):

| Field | Purpose |
| --- | --- |
| `key` | Stable migration name, e.g. `2026-11-backfill-blocks` |
| `version` | Integer revision |
| `phase` | `preflight`, `backfill`, `verify`, `cleanup` |
| `dryRun` | Boolean |
| `status` | `pending`, `running`, `succeeded`, `failed`, `paused` |
| `startedAt` / `finishedAt` | UTC |
| `lastProcessedId` | Resume cursor |
| `batchSize` | |
| `stats` | Counts, skipped, conflicts |
| `errorSample` | Redacted, bounded |
| `checksum` | Optional input/output digest |
| `appliedBy` | Operator identity |

Requirements:

- dry-run by default;
- explicit `--apply` for writes;
- bounded batches (500–1,000 rows);
- resume from `lastProcessedId`;
- idempotent `$setOnInsert`/conditional updates;
- a summary report written to a file or collection;
- no secrets/PII in logs.

Do not add a boot-time auto-migration. Migrations run as an explicit deployment
step.

---

## 5. Preflight

Run before any write:

1. **Fix current P0 security gaps** and the pre-existing `npm run check` lint
   failures, or explicitly waive them before migration work begins.
2. Take a full backup and verify point-in-time restore on a staging copy.
3. Inventory:
   - properties by `status`, `published`, `ownerId`, missing owner;
   - units by `status`, `ownerId`, missing/extra block ids;
   - leases by status, missing units;
   - invoices by period/status/owner; duplicate invoice numbers;
   - payments by status/provider reference;
   - users by role, missing `managedByOwnerId`;
   - documents, service fees, payment configs.
4. Detect duplicates that would break new unique indexes:
   - billing accounts per owner;
   - active assignments per principal/scope;
   - blocks with duplicate `{propertyId,name}`;
   - units with duplicate `{blockId,name}` (existing index should prevent);
   - active unit billing assignments;
   - live listings per unit (none initially);
   - invoice prefixes.
5. Record a baseline checksum of invoice/payment amounts and statuses.
6. Confirm the app image and migration image are the same revision.

**Gate:** no unowned live property, no impossible parent reference, no broken
invoice/payment reference, restore verified.

---

## 6. Schema additions

### 6.1 New collections

- `Block`
- `BillingAccount`
- `PaymentConfig` (or `BillingPaymentConfig`)
- `UnitBillingAssignment`
- `ManagementAssignment`
- `PropertyOwnership`
- `PropertyClaim`
- `Listing`
- `ListingPublisher`
- `UnitReservation` (new holds; no legacy reservation data to backfill)
- `BrokerProfile`
- `BrokerAuthorization`
- `CommissionAgreement`
- `Attribution`
- `CommissionAccrual`
- `CommissionPayout`
- `AuditEvent`
- `MigrationRun`

### 6.2 Existing collections — additive fields

| Collection | Fields |
| --- | --- |
| `Property` | `code`, `lifecycleState`, `verificationStatus`, `mergedIntoPropertyId`, `normalisedAddressKey`, `county`, `city`, `street`, `plotNumber`, `geocode`, `createdByUserId` |
| `Unit` | `billingAccountId`, `occupancyVersion`, `legacyBlockId`, `legacyFloorId` |
| `Lease` | `billingAccountId` |
| `Invoice` | `billingAccountId`, `billingAdminId`, `unitId`, `billingSnapshot`, `legacyOwnerId` |
| `Payment` | `billingAccountId`, `unitId`, `legacyOwnerId` |
| `PaymentSplit` | `billingAccountId` |
| `ServiceFeeItem` | `billingAccountId` |
| `UnitServiceFeeOverride` | `billingAccountId` |
| `OwnerPaymentConfig` | `billingAccountId` (mirror only) |
| `Application` | `listingId`, `publisherUserId`, `brokerUserId`, `attributionId`, `requestedUnitId` |
| `Tenant` | `sourceAttributionId` |
| `Lead` | `listingId`, `publisherUserId`, `attributionId` |
| `PropertyDocument` | `scopeType`, `scopeId`, `visibility` |
| `Notification` | `recipientType` may gain `admin`, `billing-admin`, `broker` |

All new required semantics are enforced in code first; database `required`
constraints are added only after backfill is complete.

### 6.3 Index build order

1. Non-unique lookup indexes (`billingAccountId`, `unitId`, property scope).
2. Unique indexes whose preflight is clean.
3. Unique indexes requiring conflict resolution only after the resolution
   report is approved.

Record each index and its build result in `MigrationRun.stats`.

---

## 7. Backfill order

### 7.1 Property lifecycle and identity

For each live `Property`:

- set `lifecycleState = "active"` (existing records were usable);
- set `verificationStatus = "unverified"`;
- generate a unique `code` (`KY-<short>`), preserving any existing code;
- compute `normalisedAddressKey` from `location` and available fields;
- leave `county`, `city`, `street`, `plotNumber`, `geocode` empty unless known;
- do **not** change legacy `status` (`available|occupied|maintenance`) or
  `published`;
- do **not** derive a listing from these flags yet.

Do not enforce a unique `normalisedAddressKey` until the duplicate report is
reviewed. Existing legacy records may legitimately collide.

### 7.2 Blocks

For each embedded block:

- create a `Block` document with `_id` **equal to the embedded block `_id`** so
  existing `Unit.blockId` values remain valid;
- copy name, order, rent override, purpose;
- copy floors with their embedded `_id`s, level, label, units-per-floor,
  overrides and purpose;
- set `legacyPropertyBlockId` to the same id;
- set `propertyId`.

If an embedded block has no `_id`, generate one, update all matching units by
`(propertyId, oldBlockId/name)` in a controlled script, and record the mapping.

Handle units whose `blockId` has no matching embedded block:

- create a legacy "Unassigned block" for that property, or quarantine the unit
  for manual review;
- **never** silently delete the unit;
- report the count for sign-off.

Keep `Property.blocks[]` in place. During compatibility, structure edits update
both representations by id.

**Validation:** for every live unit, `Unit.blockId` resolves to a `Block` whose
`propertyId` matches `Unit.propertyId`.

### 7.3 Owners, ownership and assignments

For every legacy `owner` user:

1. Create `PropertyOwnership` for each owned property:
   - holderType `user`;
   - holderUserId = owner;
   - shareBps = 10000;
   - isPrimaryPayee = true;
   - status `active`;
   - legacyOwnerId.
2. Create a property-scope `ManagementAssignment`:
   - principalUserId = owner;
   - accessRole = `admin`;
   - scopeType = `property`;
   - permissions = full current owner maximum;
   - status `active`;
   - source `migration`;
   - legacyOwnerId.
3. Create a `BillingAccount` (§7.4).
4. Leave `User.role = owner` until the role cutover phase.

For each property, add assignments derived from:

- `Property.custodianIds[]`: property-scope `custodian` assignment, permissions
  from current custodian maximum;
- `Property.caretakerIds[]`: property-scope `caretaker` assignment, permissions
  from `User.privileges` mapped to target actions;
- `User.managedByOwnerId`: used to validate owner scope, but **do not** grant
  caretaker access to every property solely from `managedByOwnerId`; only
  `caretakerIds` currently grants property access.

Deduplicate active assignments by `{principal, role, scope}`. Where a caretaker
has a privilege not representable in the target role maximum, record it in a
migration report for product review; do not silently grant it.

Custodian/caretaker users with no properties get no assignment.

**Gate:** every live property with a legacy owner has an active admin assignment;
every legacy caretaker property membership has an assignment; assignment count
report reviewed.

### 7.4 Billing accounts

Create one `BillingAccount` per legacy owner that owns property or has invoices:

- `ownerAdminId` = owner;
- `legalEntityName` = owner display/business name;
- `invoicePrefix`: unique. Preserve `INV` for the primary legacy owner (the one
  with existing `INV-` invoices and the earliest property), and allocate
  `INV2`, `INV3`, … (or a short account code) to others;
- seed `invoiceCounters` from the primary account's historical `INV-` numbers
  per period; other accounts start from zero because their historical numbers
  remain untouched under the old prefix;
- `defaultCurrency = KES`;
- `status = active`;
- `legacyOwnerId`.

Rationale: invoice numbers are globally unique today, but the counter is
per-owner. Two owners can both reserve `INV-YYYYMM-0001`. New account-specific
prefixes remove that collision without rewriting history.

Validate:

- no two accounts share a prefix;
- no generated new number collides with a historical number;
- historical `Invoice.invoiceNumber` values are unchanged.

### 7.5 Unit billing assignments

For every live unit:

- resolve canonical owner from `Property.ownerId`; if `Unit.ownerId` differs,
  report and use the property owner unless a reviewed exception says otherwise;
- create an active `UnitBillingAssignment` to that owner's billing account,
  `effectiveFrom` = migration date;
- set `Unit.billingAccountId`;
- preserve `Unit.ownerId` as legacy.

Do not set `effectiveFrom` in the past unless the report requires it for
historical reporting. Historical invoices keep their own snapshots.

### 7.6 Leases, invoices and payments

| Collection | Backfill |
| --- | --- |
| `Lease` | `billingAccountId` from unit/property owner; keep `ownerId` |
| `Invoice` | `billingAccountId` from `lease.unitId` assignment or `ownerId`; `billingAdminId` snapshot; `unitId` from lease when present; `billingSnapshot` (legal name/prefix); keep `ownerId` and `invoiceNumber` |
| `Payment` | `billingAccountId` via `invoice`; `unitId` via invoice; keep `ownerId` and provider reference |
| `PaymentSplit` | `billingAccountId` via payment/invoice; keep `ownerId` |

Manual invoices may have no lease/unit. Keep `unitId = ""` and use the owner's
billing account. The target model must continue to allow property-level manual
invoices for manual adjustments; a unit is required only for generated lease
invoices.

**Never** modify:
- invoice amounts, status, period, issue/paid dates, references;
- payment amounts/status/provider references;
- lease dates/rent/status;
- unit occupancy arrays.

**Gate:** invoice/payment aggregate checksums match the preflight baseline;
zero missing billing accounts for live leases/invoices/payments.

### 7.7 Payment configuration

Copy `OwnerPaymentConfig` to `PaymentConfig`:

- preserve encrypted ciphertext fields exactly;
- map `ownerId` → `billingAccountId`;
- preserve `darajaEnabled`, environment, shortcode and flags;
- `callbackPathKey` generated server-side;
- keep the legacy document and callback route.

Do not decrypt/re-encrypt in a migration script. If a field needs
transformation, do it in application code with the existing cipher and a
separate verification step.

**Gate:** number of configs and "configured" booleans match; in-flight M-Pesa
callback test passes against both new and legacy URLs.

### 7.8 Service fees

For each `ServiceFeeItem` and `UnitServiceFeeOverride`:

- set `billingAccountId` from the property owner's account;
- keep `ownerId`, `propertyId`, `unitId`, amounts and `active` unchanged;
- report items whose property/unit owner differs.

Do not merge property-level templates. A later unit billing reassignment may
need a fee-plan copy; that is an explicit admin action with audit, not a
migration rewrite.

### 7.9 Listings

Do **not** auto-publish legacy properties.

Create draft listings only for units that are currently available and belong to
a published/available property, as a review queue:

- one draft per eligible unit;
- copy display terms from unit/property;
- `state = draft`;
- `canonicalPublisherUserId` = property's legacy owner/admin;
- mark `legacyPropertyId` in metadata for reporting if the field is added.

Admins must review and publish. This avoids advertising occupied units and
avoids inventing prices.

If a property has no units, it cannot be listed; report it. Legacy public pages
remain until the listing feature flag is enabled.

### 7.10 Broker/commission

No backfill. These are new domains. Seed only reference data if approved:

- platform broker terms version;
- default commission caps/eligibility windows;
- tax placeholder (requires finance/legal approval).

### 7.11 Audit baseline

Create a migration audit event for each applied backfill and each role/ownership
change. Audit writes must not include secrets or full national IDs.

---

## 8. Role cutover

### 8.1 Order

1. Add `admin` to the role enum, permissions, routes, dashboards and tests while
   keeping `owner` accepted as an alias.
2. Add the assignment policy with legacy fallback.
3. Backfill assignments and billing.
4. Flip route families to assignments behind flags.
5. Verify no legacy fallback hits for a full release cycle.
6. Update `User.role = owner → admin` in batches, setting a
   `migratedFromOwner` flag.
7. Wait at least the 7-day JWT lifetime and one release cycle.
8. Remove owner role aliases only after all sessions and clients have rolled
   over.

### 8.2 Role update mechanics

- Batch by `_id`, idempotent, with a `MigrationRun` cursor.
- Do not touch `system-admin`, `tenant`, `custodian`, `caretaker`.
- New admins created during the window do not have `migratedFromOwner`.
- Rollback before new admin creation: `migratedFromOwner: true` → `owner`.
  After new admin creation, rollback requires a reviewed mapping, not a blanket
  reversal.
- Audit each change with actor `migration` and reason.

### 8.3 Owner semantics that must not be renamed

Do not mechanically rename:

- `PropertyOwnership` concepts to admin;
- `Invoice.ownerId`/`Payment.ownerId` before billing account cutover;
- legal-owner labels in invoices/contracts;
- payment provider callback path segments before the adapter exists;
- test fixtures that represent historical owner behavior.

---

## 9. Application cutover

### 9.1 Route families

Flip in this order, each behind a flag and with a comparison report:

1. P0 security fixes (caretaker/custodian/public unit leaks) — no flag.
2. Assignment read/capability endpoint — canary.
3. Property/block/unit reads.
4. Property/block/unit mutations.
5. Tenant/application/move-request/lease authorization.
6. Invoice/payment authorization and billing account resolution.
7. Service-fee/payment-config writes.
8. Marketplace listing reads; then publisher writes.
9. Broker onboarding/authorization.
10. Attribution; then commission shadow mode.
11. Commission approvals/payouts.

For each family:

- run old and new authorization decisions in shadow for a sample;
- log mismatches with redacted ids;
- investigate before enabling enforcement;
- roll back by flag if error/latency thresholds are exceeded.

### 9.2 Public pages

- Keep `/properties` and `/properties/[id]` until the marketplace pages are
  ready.
- The new public listing page must not reuse `includeUnits=all`.
- Purge caches on listing transitions.
- Add redirects only after SEO review.

### 9.3 Payment callbacks

- Deploy the new callback route before any new payment writes the new URL.
- Keep the legacy `[ownerId]` route resolving through `legacyOwnerId`.
- Test in-flight payment created before deployment and settled after.
- Never invalidate old callback tokens during the window.

### 9.4 Invoice numbering

- Deploy the prefix-aware numbering behind a flag.
- Generate a dry-run report per account/period.
- Enable for new invoices only; historical numbers never change.
- Keep the unique `invoiceNumber` backstop and add retry on `E11000`.

---

## 10. Verification

### 10.1 Structural checks

- Every live property has exactly one active 100% owner record **if** the
  legacy owner existed.
- Every live property has at least one active admin assignment.
- Every live unit resolves to a block in the same property.
- Every live unit has exactly one active billing assignment.
- Every live lease has a unit and billing account.
- Every live generated invoice has a unit and billing account; manual invoices
  may omit unit.
- Every payment resolves to an invoice and billing account.
- Every caretaker/custodian legacy assignment is represented, or reported.
- No active assignment references an inactive user, archived property, or
  mismatched parent.
- No duplicate active assignment/billing assignment/listing.

### 10.2 Financial checks

- Invoice count, amountDue sum, amountPaid sum and status counts unchanged.
- Payment count, amountMinor sum, status counts unchanged.
- PaymentSplit count and sums unchanged.
- No invoice number changed.
- No payment provider reference changed.
- Commission collections are empty before the commission phase.

### 10.3 Functional checks

- Owner can sign in and see the same portfolio.
- Caretaker can see only previously assigned properties.
- Custodian can see only the managing owner's portfolio, with documents fixed.
- Tenant can see only own records.
- Invoice generation and manual invoice flows work under the new billing
  account.
- M-Pesa/Paystack settlement works with old and new callback paths.
- Public pages cannot expose occupied units.

### 10.4 Reconciliation job

After cutover, run daily until stable:

- compare legacy `ownerId` scope vs assignment scope for sampled users;
- compare `Unit.billingAccountId` vs active `UnitBillingAssignment`;
- compare `Property.blocks[]` vs `Block` collection by id;
- compare `Invoice.ownerId` vs `billingAccountId` for legacy invoices;
- report drift; never auto-delete.

---

## 11. Rollback

### 11.1 Before route-family cutover

- Disable the feature flag.
- Stop dual writes if necessary.
- Legacy fields are still current; no data loss.
- New collections may remain unused.

### 11.2 After assignment enforcement

- Re-enable legacy fallback for the affected route family.
- Do not delete assignments; they remain for the next attempt.
- If role update has not run, users still have `owner` and old dashboards work.

### 11.3 After role update

- Use `migratedFromOwner` to restore only migrated users within the approved
  window.
- New admins cannot be safely converted back; require a reviewed mapping.
- Restore from backup only as a last resort, with a documented data-loss
  window.

### 11.4 After public marketplace cutover

- Redirect public listing pages back to legacy property pages.
- Pause new listings; preserve created drafts.
- Do not delete publisher/attribution history.

---

## 12. Deployment sequence

1. Staging clone + full dry-run + reports.
2. Production backup and restore verification.
3. Deploy additive code (new models, flags off, dual-write support).
4. Run preflight; stop on conflicts.
5. Run backfills in order; validate after each.
6. Deploy assignment-aware read paths; enable canary flags.
7. Enable P0 fixes.
8. Enable route-family enforcement.
9. Enable new public marketplace behind a flag; compare results.
10. Run role cutover after the compatibility cycle.
11. Enable broker onboarding/authorization.
12. Enable attribution; run commission in shadow mode.
13. Enable commission approvals/payouts after finance/legal sign-off.
14. Remove legacy fallbacks only in a later release.

Each step needs an owner, a rollback action and a go/no-go check.

---

## 13. Data retention and privacy

- Keep legacy fields until at least one full release cycle after cutover.
- Do not copy full national IDs or payment secrets into audit events.
- Preserve encryption for payment credentials.
- Expire provisional attribution evidence per policy.
- Record consent/legal basis for broker attribution where required.
- Document tenant/broker data retention before enabling commission.

---

## 14. Open migration decisions

- Whether legacy owners with no property but with invoices get a billing
  account (recommended: yes).
- Whether `normalisedAddressKey` becomes unique (recommended: no in the first
  release).
- Whether custodians/caretakers retain property-creation rights (recommended:
  no; admin-only initially).
- Whether manual property-level invoices continue indefinitely (recommended:
  yes, for adjustments).
- Whether old property-level public pages are retired or redirected.
- Whether commission data is needed for historical tenancies (recommended: no).
