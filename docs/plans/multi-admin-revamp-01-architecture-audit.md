# Stage 1 — Current Architecture Audit

**Status:** Stage 1 complete; P0 and Phase 1 implementation authorized 2026-11-02
**Date:** 2026-11-01; repository reconciliation: 2026-11-02
**Scope:** Audit of the existing Keja Yangu implementation to establish a factual
baseline for the multi-admin, property-marketplace and broker redesign.  
**Companion documents:** `multi-admin-revamp-02-gap-analysis.md`,
`03-domain-model.md`, `04-authorization.md`,
`05-marketplace-broker-commission.md`, `06-migration-plan.md`,
`07-phased-implementation.md`, `08-open-questions-risks.md`.

> This is a Stage 1 document. It does not authorise production-code or schema
> changes. All proposals elsewhere in the Stage 1 set are subject to approval.

> The detailed audit below is the 2026-11-01 snapshot. Section 8 records the
> 2026-11-02 verification and takes precedence wherever the snapshot is stale.

---

## 1. Executive summary

Keja Yangu is a single Next.js 16 application serving:

- the public marketing/listing site;
- five role dashboards (`owner`, `custodian`, `caretaker`, `tenant`,
  `system-admin`);
- a REST API under `/api/v1`;
- server-side domain services for allocation, invoicing, payments and
  notifications;
- MongoDB through Mongoose.

The current product is **portfolio-centric**. A `Property` belongs to one
`ownerId`; owner, custodian and caretaker access is derived from that owner
relationship; invoices, service fees, payment configuration and notification
recipients all carry or resolve through the same owner. The marketplace is
**property-level**: a published, available property appears in `/properties`,
and the public detail page can expose every unit's status and rent.

The redesign needs to separate four concepts that are currently fused:

| Concept | Current representation | Target requirement |
| --- | --- | --- |
| Physical inventory | `Property` + embedded `blocks[]` + separate `Unit` | One canonical property/block/unit record shared by all admins |
| Legal ownership | `Property.ownerId` | Independent ownership interests, possibly multiple |
| Management authority | owner/custodian/caretaker relationships | Scoped, revocable admin assignments at property/block/unit level |
| Financial responsibility | owner-based invoices, fees and payment config | Explicit billing/financial responsibility per unit |
| Marketplace participation | one property-level public listing | Unit-centric listings, multiple authorised publishers, broker attribution |

The codebase is functionally rich and already has several invariants worth
preserving: `Lease.unitId` is authoritative for occupancy, `lib/allocation.ts`
is the only occupancy writer, invoice snapshots are immutable, payment
settlement is idempotent, soft delete is pervasive, and every API mutation is
server-authorised. The redesign must extend these invariants rather than replace
them.

The largest migration hazard is not a single schema field: it is the breadth of
the owner assumption. A source scan found:

- **948** occurrences of `ownerId` across **177** TypeScript/TSX files;
- **327** occurrences of the `"owner"` role literal across **120** files;
- **73** API route files;
- **162** Vitest test files.

The current implementation has **no** broker, commission, referral,
attribution or marketplace domain. A case-insensitive search across `src/` and
`scripts/` returned no matches for those terms.

---

## 2. Runtime topology

```text
Browser
  ├─ public site: /, /properties, /properties/[id]
  ├─ auth: /auth, /auth/verify, /auth/forgot-password, /auth/reset-password
  └─ dashboards: /dashboard/{owner,custodian,caretaker,tenant,system-admin}
        │
        │ HTTP + httpOnly keja-token cookie
        ▼
Next.js 16 App Router
  ├─ src/proxy.ts (edge gate; cookie presence only)
  ├─ src/app/api/v1/**/route.ts (REST handlers)
  ├─ src/lib/* domain services and guards
  └─ src/models/*.ts (Mongoose models)
        │
        ├─ MongoDB (MONGODB_URI; .env.example uses mongodb+srv)
        ├─ Paystack (platform checkout + HMAC webhook)
        ├─ Safaricom Daraja (per-owner STK push + URL-token callback)
        ├─ Nodemailer
        └─ UploadThing
```

Relevant configuration and deployment facts:

- `docker-compose.yml` runs only the app container; MongoDB is external.
- `.env.example` points at a MongoDB Atlas-style `mongodb+srv` URI.
- The code deliberately avoids relying on transactions. `lib/allocation.ts`
  uses atomic claims plus compensation; invoice generation and payment
  settlement use unique indexes and conditional updates.
- CI (`.github/workflows/ci.yml`) runs Biome, typecheck, build and
  `test:coverage`; the deploy job is still a placeholder.
- `@playwright/test` is a declared dependency, but no tracked Playwright config
  or e2e specs were found.

---

## 3. Request and authorisation path

### 3.1 Session

1. Sign-in/sign-up/verify issues a 7-day JWT in the httpOnly `keja-token`
   cookie (`src/app/api/auth/route.ts`).
2. `src/proxy.ts` redirects unauthenticated `/dashboard/*` requests to `/auth`.
   It only checks that a cookie exists; it does not verify signature or role.
3. API handlers verify the JWT and re-read the active user from MongoDB.
4. Mutations generally also enforce same-origin and rate limits.

### 3.2 API guards

The central guard is `requirePermission(request, action, { resource })` in
`src/lib/permissions.ts`. It:

- verifies the token and reloads the user;
- rejects inactive users;
- resolves `role`, `privileges`, `managedByOwnerId`;
- performs role-specific checks;
- for owner/custodian, optionally compares `resource.ownerId` to the actor's
  owner scope;
- for caretakers, checks privilege presence and, for some actions,
  `resource.ownerId === managedByOwnerId`;
- only checks `resource.caretakerIds` for `property:delete`.

The guard is not a generic policy engine. Several routes perform additional
scope checks locally; others do not. This inconsistency is documented in the
gap analysis.

### 3.3 Current role model

`src/lib/permissions.ts:9` defines:

```text
tenant | caretaker | custodian | owner | system-admin
```

Current behaviour:

| Role | Effective scope | Notable constraints |
| --- | --- | --- |
| `owner` | Properties where `Property.ownerId === User._id` | Full portfolio control |
| `custodian` | `managedByOwnerId` portfolio | Owner-delegate; cannot manage custodians; may hold `assign_privileges` |
| `caretaker` | `managedByOwnerId` + `Property.caretakerIds` | Privilege-gated writes; scoping is inconsistent across routes |
| `tenant` | Own `Tenant` rows, invoices, requests | Cannot read portfolio data except vacancies at their property |
| `system-admin` | Global | Property types and recycle bin are system-admin-only |

Privileges are stored as strings on `User.privileges` and are only meaningful
for caretakers (plus `assign_privileges` for custodians).

---

## 4. Data model map

All model ids are strings in application code; MongoDB `_id`s are ObjectIds
unless noted. The majority of relationships are denormalised string fields, not
Mongoose `ref`/`populate` joins.

### 4.1 Identity and access

| Model | Purpose | Key fields / relationships |
| --- | --- | --- |
| `User` | Login identity for all roles | `role`, `privileges[]`, `managedByOwnerId`, `isActive`, `isVerified`, `invoiceCounters` |
| `PropertyType` | Platform taxonomy | `key` unique among live types; `Property.type` stores the key |
| `OwnerPaymentConfig` | Per-owner Daraja credentials | unique `ownerId`; encrypted secrets |

`User.role` is duplicated in `src/models/User.ts`, `src/lib/permissions.ts`,
`src/lib/role-routes.ts`, `src/config/dashboardNav.ts`, `src/proxy.ts` role
maps and several clients/tests.

### 4.2 Physical inventory

| Model | Purpose | Key fields / relationships |
| --- | --- | --- |
| `Property` | Building/property record | `ownerId`, `caretakerIds[]`, `custodianIds[]`, `published`, `status`, embedded `blocks[]` |
| `Property.blocks[]` | Embedded block/floor structure | block `_id`, name/order/rent override/purpose; floor `_id`, level/label/unitsPerFloor/rent override/purpose |
| `Unit` | Materialised rentable unit | `propertyId`, `ownerId`, `blockId`, `floorId`, name, status, rent, service-charge fields, `tenantId[]` |

Important current facts:

- `Property` has no unique physical identity. Only `title`, `location` and
  other descriptive fields are stored. There is no county, street, plot
  number, geocode or normalised address key.
- `Property` has no `ownerId`, `caretakerIds` or `custodianIds` index of its
  own. The only declared property index is `{ status, published }`, plus the
  soft-delete index.
- Blocks are embedded in `Property.blocks[]`; their `_id`s are referenced by
  `Unit.blockId`. Floors are embedded in blocks and referenced by
  `Unit.floorId`.
- `Unit` has a partial unique index on `{ blockId, name }` among live rows, so
  unit names are unique per block, not per property. There are indexes on
  `{ propertyId, status }`, `{ ownerId, status }` and
  `{ blockId, floorLevel }`.
- `Unit.tenantId[]` contains **occupant `User._id`s**, not `Tenant._id`s.

### 4.3 Tenancy and occupancy

| Model | Purpose | Key fields |
| --- | --- | --- |
| `Tenant` | Property membership/billing subject | `propertyId`, `ownerId`, optional `userId`; unique live email/phone per property |
| `Lease` | Billing contract and occupancy pointer | `tenantId`, `propertyId`, `ownerId`, `unitId`, rent, status |
| `Application` | Prospect request | `propertyId`, optional `unitId`, `ownerId`, `applicantUserId`, status |
| `MoveRequest` | Move-in/out request | `propertyId`, `unitId`, `tenantId`, `requestedById`, status |
| `Lead` | Pre-account prospect | `ownerId`, optional property/unit, conversion fields |

Critical invariants:

- `Lease.unitId` is authoritative occupancy. `Unit.tenantId` and
  `Unit.status` are a cache.
- `lib/allocation.ts` is the only module permitted to transition occupancy and
  create/end active leases.
- A tenant must be linked to an active `User` before allocation.
- `Lease` has a partial unique index allowing at most one active lease per
  tenant. Despite comments about multi-unit tenancy, `allocateUnit` repoints an
  existing active lease to the new unit rather than creating a second lease.
- `Tenant` is a property membership, not a login account. Its uniqueness is
  email/phone **per property**.

### 4.4 Billing and payments

| Model | Purpose | Key fields |
| --- | --- | --- |
| `Invoice` | Rent/service-fee invoice | `invoiceNumber`, `tenantId`, `propertyId`, `leaseId`, `ownerId`, period, amountDue/amountPaid, status, rent/service-charge snapshot |
| `Payment` | Provider payment attempt | provider/reference, `invoiceId`, `tenantId`, `ownerId`, `propertyId`, amountMinor, status, expiry |
| `PaymentSplit` | Rent vs service-charge allocation on settlement | `paymentId` unique, `invoiceId`, `unitId`, `ownerId`, `rentMinor`, `serviceChargeMinor` |
| `ServiceFeeItem` | Property-level fee template | `ownerId`, `propertyId`, label, amount, appliesTo, unitIds |
| `UnitServiceFeeOverride` | Per-unit fee deviation | `ownerId`, `propertyId`, `itemId`, `unitId`, amount/active |
| `OwnerPaymentConfig` | Per-owner Daraja configuration | unique `ownerId`, encrypted Daraja secrets |

Current financial assumptions:

- Invoice numbers come from `nextInvoiceNumber(ownerId, period)`, which
  increments `User.invoiceCounters` on the owner document
  (`src/lib/invoice-numbering.ts`).
- `Invoice.ownerId` is required and is the payee/billing scope. The rent and
  service-charge portions are snapshotted at issuance.
- `Invoice` has a partial unique index on `{ leaseId, period }` for live
  generated invoices and a unique live `invoiceNumber`.
- `Payment` has a unique `{ provider, providerReference }` mutex and at most one
  pending payment per invoice.
- `lib/payments/settle.ts` is the single provider-settlement path. It requires
  the exact remaining balance, conditionally flips the invoice, records
  `PaymentSplit`, and never throws for provider inconsistencies.
- Paystack is platform-wide; Daraja credentials are per owner. The M-Pesa
  callback URL is
  `/api/v1/payments/mpesa/callback/[ownerId]/[token]`.
- `ServiceFeeItem` and `UnitServiceFeeOverride` are effectively
  property/owner-scoped templates. `lib/service-fees.ts` is the single resolver;
  if no item applies, the legacy flat `Unit.serviceCharge` becomes an implicit
  item.
- `PaymentSplit` currently has two implicit beneficiaries: rent → owner,
  service charge → caretaker. It is not a general multi-party ledger and has no
  commission concept.

### 4.5 Communications and notifications

| Model | Purpose | Key fields |
| --- | --- | --- |
| `Complaint` | Tenant complaint | `tenantId`, `propertyId`, `ownerId`, optional `unitId`, status/priority |
| `ChatThread` / `ChatMessage` | Tenant↔staff conversation | `tenantId`, `propertyId`, `ownerId`, `agentUserId`, sender user id |
| `Announcement` | Staff notice | `ownerId`, optional `propertyId`, audience, author |
| `PropertyDocument` | Document metadata | `ownerId`, optional `propertyId`/`tenantId`, uploader |
| `Notification` | Per-recipient inbox row | `recipientUserId`, type, dedupeKey, optional email |

`lib/notifications.ts` resolves staff recipients as owner, then the owner's
custodians, then property caretakers. The recipient type is literally
`owner | caretaker | custodian`; there is no admin or broker recipient model.
Announcement/complaint/chat scoping also assumes the owner relationship.

### 4.6 Discovery and preferences

`PropertyFavorite`, `UnitFavorite` and `PropertyView` provide property- and
unit-level discovery. Favourites are keyed by `(userId, targetId)`. Unit
favourites drive "unit available" notifications when a unit transitions to
available.

### 4.7 Soft delete coverage

`Property`, `Unit`, `Tenant`, `Lease`, `Invoice`, `PropertyType`, `Lead` and
`Application` use the soft-delete plugin. The plugin adds `deletedAt`, filters
reads by default and exposes delete/restore helpers. Recycle-bin types are
limited to property, unit, tenant, lease, invoice and property type.

---

## 5. Current end-to-end flows

### 5.1 Property creation and structure

1. `POST /api/v1/properties` requires `property:create`.
2. The route determines the owning portfolio:
   - owner → own id;
   - system-admin → target owner id;
   - caretaker → managing owner (and force-adds self to `caretakerIds`);
   - custodian → managing owner.
3. Staff assignment arrays are validated against active/verified users of the
   same role and same managing owner.
4. The property is always created unpublished.
5. Optional `blocks[]` are embedded and units are materialised in bulk from
   floor counts. If generation fails, the property is hard-deleted to let the
   client retry.
6. `PUT /properties/[id]/structure` reconciles edits by id, preserving existing
   unit ids, refusing to remove occupied blocks/floors, and soft-deleting only
   vacant units.

There is no search-before-create, no canonical address check, no claim or
approval flow, and no way to attach an existing property to a second manager.

### 5.2 Public listing and application

1. `GET /api/v1/properties` with no authenticated staff actor returns every
   property with `status: "available"` and `published: true`, with owner/staff
   ids projected away.
2. `GET /api/v1/properties/[id]` returns a published available property to the
   public. The caller can pass `?includeUnits=all`; the route then returns every
   live unit's name, floor, rent, beds/baths/area and status, including occupied
   units, **without an auth check**.
3. `GET /properties/[id]/unit-summary` exposes aggregate availability for
   published/available properties and treats any authenticated owner, caretaker,
   custodian or system-admin as a manager.
4. A tenant applies with `POST /api/v1/applications`; only property-level
   duplicate applications are prevented.
5. Approval creates/binds a `Tenant`, then allocates the requested unit if one
   was supplied.

The marketplace therefore has no listing lifecycle, no unit-level listing
authorisation, no publisher/broker identity and no attribution.

### 5.3 Allocation and vacating

`allocateUnit`:

- validates tenant and unit exist and share a property;
- resolves/heals the occupant user id;
- atomically claims an `available` unit with
  `{ _id, status: "available", deletedAt: null }`;
- binds the tenant user and status;
- creates or repoints the active lease;
- compensates by releasing the unit if the lease/bind fails.

`vacateUnit`:

- finds a unit occupied by the tenant's user id (or legacy tenant id);
- removes the occupant from the array;
- marks the unit available only when no occupants remain;
- notifies unit favourites;
- ends active leases.

### 5.4 Invoice generation

1. Generation selects active leases in the actor's scope.
2. It rejects future periods and skips owning tenants, already-generated
   periods, non-monthly leases, ended leases and leases starting after the
   period.
3. It batch-loads service fees for the leases' units.
4. Each draft receives a frozen rent/service-fee snapshot and an invoice number
   from the owner's atomic counter.
5. Unique indexes are the final duplicate backstop.

There is one billing owner per invoice. There is no concept of an admin
different from the legal owner, a billing group, or a commission deduction.

### 5.5 Online payments

Paystack and Daraja converge on `applyProviderPayment`:

- find the initiation-created `Payment` by provider reference;
- require the exact outstanding minor amount;
- conditionally flip the invoice from pending/draft to paid;
- mark the payment successful;
- notify the tenant;
- record `PaymentSplit` best-effort.

Daraja callbacks are authenticated by an HMAC token in the URL and include the
owner id. New admin/billing identities must preserve callback compatibility for
in-flight payments.

### 5.6 Communications

Complaints, chat, announcements and documents resolve recipients and scopes
from `ownerId`, `managedByOwnerId`, `caretakerIds` and tenant rows. Documents
currently have an authorisation gap for custodians (see gap analysis). Search
also composes owner/caretaker URLs and has no broker/admin/branding model.

---

## 6. Frontend and role surfaces

- Public: `/`, `/properties`, `/properties/[id]`.
- Dashboards: owner, custodian, caretaker, tenant, system-admin.
- `src/config/dashboardNav.ts` hard-codes role sections and URLs.
- `src/app/dashboard/layout.tsx` maps only exact base paths to allowed roles.
  A nested path such as `/dashboard/tenant/payments` therefore receives
  `allowedRoles: undefined`, so `AuthGuard` checks only that a user is signed
  in, not that the user belongs to that dashboard.
- `AuthGuard` is a client UX gate, not a security boundary; API routes remain
  the enforcement point.
- The public property detail page uses `includeUnits=all` when the unit list is
  expanded, so the client currently depends on the broad unit response.

---

## 7. Quality, tests and operational tooling

- 162 Vitest files, colocated with source. Coverage includes permissions,
  allocation, service fees, invoice generation, payments, notifications,
  routes, hooks and components.
- No tracked Playwright/e2e suite, despite the dependency.
- `scripts/` contains 13 idempotent, dry-run-oriented backfills/migrations
  (rental invoicing, phone normalisation, soft-delete indexes, service fees,
  unit ids, tenant user ids, national-id encryption, property types).
- No migration runner, schema version table or automatic boot-time migration.
- No general audit log. Some actions emit `console.info`; that is not an
  immutable audit trail.
- No database transaction usage in the audited critical paths.

## 8. Repository reconciliation (2026-11-02)

This reconciliation was completed after review of the approval package in
`multi-admin-revamp-09-approval.md`. It records the current repository state;
the approved design remains a target, not implementation authorization.

### 8.1 Updated source inventory

Counts below are reproducible against Git-tracked `src/` files (except the
migration-script and e2e counts, which use their named paths):

| Measure | 2026-11-01 snapshot | 2026-11-02 verified |
| --- | ---: | ---: |
| `ownerId` references under `src/` | 948 | 985 |
| `"owner"` role literals | 327 | 341 |
| TypeScript files containing `"owner"` | 120 | 127 |
| Vitest files | 162 | 173 |
| API route files under `/api/v1` | 73 | 73 |
| Migration scripts | 13 | 14 |
| Tracked Playwright/e2e files | 0 | 0 |

### 8.2 Implemented foundations

- `admin` is present in the user role type and selected central role maps, but
  currently routes to the owner dashboard; this is compatibility groundwork,
  not the completed admin cutover.
- `ManagementAssignment`, `PropertyOwnership`, `PropertyClaim` and `AuditEvent`
  models exist. Assignment grant/accept/revoke services and routes, a capability
  endpoint, policy/resource-loader code, audit helpers, a dry-run/apply
  assignment backfill, and authorization shadow/enforcement adapters also exist.
- The new authorization path remains opt-in by API route family and retains
  legacy fallbacks. Assignment-backed access is therefore not yet the universal
  authority path. Ownership/claim models do not yet have the complete approved
  review, dispute or merge workflows, and audit coverage is partial.
- The P0 public-unit projection, unit-summary/count scoping, custodian document
  filtering and nested dashboard role guard findings in the original snapshot
  have corresponding code fixes. The full current Vitest suite passes; this is
  not evidence of staging data migration or operational sign-off.

### 8.3 Still absent or incomplete

- No canonical `Block` collection, property identity/deduplication workflow,
  billing-account domain, unit billing assignment, or billing-account callback
  adapter was found.
- No unit `Listing`/publisher domain, broker profile/authorization/agreement,
  attribution service, or commission accrual/payout domain was found.
- Existing routes and financial records still use legacy owner scope. There is
  no demonstrated owner-to-admin migration, general migration-run tracking,
  full route-family cutover, or legacy-field retirement.
- No tracked e2e suite was found. Backup/restore, staging-clone, financial
  checksum and migration-runbook evidence were not available in the repository.

### 8.4 Verification baseline

- `npm run typecheck`: passed.
- `npm run test`: passed, 173 files and 1,698 tests.
- Read-only `npx biome check .`: one warning in
  `src/hooks/use-service-fees.ts`; no fixes applied.
- `npm run check` is not a read-only check in this repository: it invokes
  `biome check --write .`. Do not use it as an audit command without accepting
  possible file modifications.

Phase 0 remains the next implementation phase, but the approval document
explicitly withholds implementation authorization. Product/legal/finance
confirmations and operational readiness must be handled under the approved
gates before code, schema, migration or runtime work begins.

---

## 8. Verified invariants to preserve

These are non-negotiable for the redesign:

1. **Identity separation:** `Tenant._id` is not `User._id`. `Lease`, `Invoice`,
   `Complaint`, `ChatThread` and `MoveRequest` hold `Tenant._id`; `Unit.tenantId[]`
   and actor fields hold `User._id`.
2. **Occupancy authority:** only `lib/allocation.ts` mutates occupancy/active
   leases.
3. **Invoice immutability:** issued invoice rent/service-fee fields are frozen.
4. **Payment idempotency:** provider reference uniqueness, exact-amount
   settlement and conditional invoice flips remain.
5. **Soft delete:** live-only uniqueness and recycle-bin behaviour remain.
6. **Server-side authorisation:** UI guards cannot substitute for API checks.
7. **PII protection:** national IDs are encrypted; public projections must
   continue to strip owner/staff identifiers.
8. **Money units:** invoices are stored in major KES; provider boundaries use
   minor units.
9. **Migration safety:** migrations must be additive, idempotent and reversible
   until cutover.

---

## 9. Baseline measurements

| Measurement | Current value | Scope |
| --- | --- | --- |
| `ownerId` references | 948 in 177 files | `src/**/*.ts[x]` including tests/data |
| `"owner"` role literals | 327 in 120 files | `src/**/*.ts[x]` including tests |
| API route handlers | 73 | `src/app/api/v1/**/route.ts` |
| Vitest test files | 162 | `src/**/*.test.ts[x]` |
| Migration scripts | 13 | `scripts/*` |
| Broker/commission/attribution matches | 0 | `src/` and `scripts/` |

The measurements are a floor, not a complete estimate: changing the role name
also affects database rows, docs, fixtures and API contracts.

---

## 10. Audit conclusion

The current system is a solid single-owner property manager. It is **not** a
multi-admin platform and has **no marketplace or broker domain**. Adding those
features is a domain-model change, not a UI feature:

- the physical property must become independent of who manages it;
- management authority must become explicit and scoped;
- billing responsibility must become explicit per unit;
- listings must be unit-centric and authorised;
- broker participation must be explicit, attributable and financially auditable.

The next document quantifies each gap against the requested product.
