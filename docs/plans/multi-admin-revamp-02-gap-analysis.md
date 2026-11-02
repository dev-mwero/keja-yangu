# Stage 1 — Gap Analysis

**Status:** Draft for approval  
**Date:** 2026-11-01  
**Baseline:** `multi-admin-revamp-01-architecture-audit.md`  
**Purpose:** Compare the requested multi-admin marketplace/broker product with
the current implementation and prioritise the work.

Severity:

- **P0** — security, data-integrity or migration blocker.
- **P1** — required to deliver the requested product.
- **P2** — important operational/UX improvement, can follow the first release.

---

## 1. Requirement coverage summary

| Requirement | Current state | Coverage |
| --- | --- | --- |
| One canonical property record | Property exists but is owner-bound and has no reliable physical identity | Partial |
| Multiple admins per property | One owner; custodian/caretaker are delegates | Missing |
| Property/block/unit-level admin scope | Only portfolio-level plus `caretakerIds` for some actions | Partial |
| Independent legal ownership | `Property.ownerId` is both owner and manager | Missing |
| Explicit billing/financial responsibility | `Invoice.ownerId` and `OwnerPaymentConfig` | Partial, not per unit |
| Unit-level marketplace listing | Property-level publish and availability | Missing |
| Multiple publishers per listing | None | Missing |
| Broker role and accounts | None | Missing |
| Broker onboarding/verification | None | Missing |
| Broker authorisation by property/unit | None | Missing |
| Commission agreements | None | Missing |
| Immutable acquisition attribution | None | Missing |
| Commission accrual/payout | None | Missing |
| Central, testable authorization | `requirePermission` plus route-local checks | Partial |
| Immutable audit log | Ad-hoc `console.info` only | Missing |
| Safe migration from owner model | Greenfield `ownerId` everywhere | Missing |

---

## 2. Domain and data-model gaps

| ID | Severity | Gap | Evidence | Impact | Target |
| --- | --- | --- | --- | --- | --- |
| G-01 | P1 | Property is bound to a single `ownerId`, which doubles as manager and payee. | `src/models/Property.ts:45`; `src/lib/permissions.ts` owner scope | Cannot represent multiple admins or a manager independent of ownership. | Domain doc §3–4 |
| G-02 | P1 | No block collection. Blocks/floors are embedded in `Property.blocks[]`; units reference embedded ids. | `src/models/Property.ts:63`; `src/lib/property-structure.ts` | Two admins cannot independently add blocks to the same property; no cross-property block uniqueness. | Domain doc §5 |
| G-03 | P1 | No physical property identity/dedupe. No county, street, plot number, geocode or normalised address. | `src/models/Property.ts` | Duplicate properties are likely as admins self-register; cannot merge safely. | Domain doc §3.3 |
| G-04 | P1 | No ownership-interest model. Legal owners, landlords and managers are conflated. | `Property.ownerId`; `Invoice.ownerId`; `PaymentSplit` | Rent payee cannot differ from manager; multiple co-owners unsupported. | Domain doc §6 |
| G-05 | P1 | No management assignment. Custodian scope is one `managedByOwnerId`; caretaker assignment is an array on property and is not used consistently. | `User.managedByOwnerId`; `Property.caretakerIds[]`; `permissions.ts` | Cannot grant/revoke scoped authority safely; no admin role at all. | Domain doc §4 |
| G-06 | P1 | No per-unit financial responsibility. Fees, payment credentials and invoice numbers are owner-scoped. | `OwnerPaymentConfig`; `ServiceFeeItem.ownerId`; `invoice-numbering.ts` | Different admins cannot bill different units under a common property. | Domain doc §7 |
| G-07 | P1 | `Unit.tenantId[]` is a denormalised occupant cache; `Lease.unitId` is authoritative. | `src/models/Unit.ts:44`; `src/lib/allocation.ts` | Block/unit merges and admin transfer can corrupt occupancy if caches are copied without reconciliation. | Domain doc §5.6 |
| G-08 | P1 | Current lease uniqueness supports one active lease per tenant; allocation repoints it rather than creating a second lease. | `src/models/Lease.ts`; `src/lib/allocation.ts:132-153` | "Multi-unit tenant" is not actually implemented and must not be assumed by the redesign. | Domain doc §6; D-16 |
| G-09 | P1 | No listing entity. Public status is `Property.published` + `Property.status`. | `src/models/Property.ts`; `src/app/api/v1/properties/route.ts:52` | Unit-level availability, pricing and publication cannot be represented. | Domain doc §8 |
| G-10 | P1 | No publisher/attribution model. | No matches for `broker|commission|attribution|referral` | Cannot reward a broker or track who sourced a tenant. | Marketplace doc §4–7 |
| G-11 | P1 | No broker identity, verification, licence or contract state. | `User.role` excludes broker | Broker cannot register, be approved or act within scope. | Marketplace doc §5 |
| G-12 | P1 | No commission ledger. `PaymentSplit` only distinguishes rent and service charge. | `src/models/PaymentSplit.ts` | Commission cannot be accrued, reversed or paid without corrupting settlement. | Marketplace doc §8 |
| G-13 | P1 | No audit log for role, assignment, listing, attribution or commission changes. | `console.info` only | Disputes and privilege changes are not defensible. | Authz doc §8 |
| G-14 | P1 | No schema/migration versioning. Scripts are ad hoc. | `scripts/*`, no migration runner | Large owner→admin migration cannot be tracked or safely rolled back. | Migration doc §4 |
| G-15 | P2 | `Unit` has no explicit block/floor snapshot beyond ids/names; names can drift. | `src/models/Unit.ts`; `property-structure.ts` | Reports may show stale block/floor names after structure edits. | Domain doc §5.5 |

---

## 3. Authorization and security gaps

| ID | Severity | Gap | Evidence | Impact | Target |
| --- | --- | --- | --- | --- | --- |
| G-16 | **P0** | Public property detail with `includeUnits=all` returns all unit statuses/rents without auth. | `src/app/api/v1/properties/[id]/route.ts:85-105` | Occupied/rent data leak; brokers/tenants can see non-public inventory. | Marketplace doc §9 |
| G-17 | **P0** | Any authenticated caretaker passes `unit:read`; `unit-summary` then treats caretaker as manager. | `src/lib/permissions.ts:248`; `src/app/api/v1/properties/[id]/unit-summary/route.ts:30` | Any caretaker can read any property's unit summary. | Authz doc §4 |
| G-18 | **P0** | `unit-counts` has the same caretaker pass-through and counts arbitrary properties. | `src/app/api/v1/properties/[id]/unit-counts/route.ts:32`; `src/lib/permissions.ts:248` | Cross-portfolio occupancy disclosure. | Authz doc §4 |
| G-19 | **P0** | Custodian document listing has no custodian filter branch; it falls through with an empty filter. | `src/app/api/v1/documents/route.ts:29-45` | Custodians can list all documents. | Authz doc §4 |
| G-20 | P1 | Caretaker `application:manage` checks only `resource.ownerId`, not assigned property. | `permissions.ts:279-287`; `applications/[id]/route.ts:28` | Any caretaker with `manage_tenants` can decide applications across the owner's portfolio. | Authz doc §5 |
| G-21 | P1 | Caretaker `move-request:manage` checks only owner scope, not assigned property. | `permissions.ts:262-269`; `move-requests/[id]/route.ts:23` | Same portfolio-wide overreach; approval can allocate/vacate. | Authz doc §5 |
| G-22 | P1 | Caretaker `unit:manage` checks owner scope, not `caretakerIds`. | `permissions.ts:250-258`; `units/[id]/route.ts:55` | Any caretaker with `manage_units` can edit units in any property of the owner. | Authz doc §5 |
| G-23 | P1 | `requirePermission` is action-specific and easy to bypass with a missing or incomplete resource. Several actions deliberately return `null` without a resource. | `permissions.ts` | New routes can ship with accidental cross-scope access. | Authz doc §6 |
| G-24 | P1 | Nested dashboard paths receive `allowedRoles: undefined`; `AuthGuard` allows any signed-in user. | `src/app/dashboard/layout.tsx:10-19`; `src/components/AuthGuard.tsx` | UI exposes wrong dashboard data; API still blocks but UX and perceived isolation fail. | Authz doc §9 |
| G-25 | P1 | `proxy.ts` only checks cookie presence, not JWT validity or role. | `src/proxy.ts:10` | Cannot rely on edge gate for authorisation; must remain defence in depth only. | Authz doc §10 |
| G-26 | P1 | Owner/custodian actions compare `resource.ownerId` only after the route supplies a resource; some routes use resource-free permission checks then a separate scope helper. | `tenants/route.ts`; `invoices/route.ts` | Inconsistent enforcement and hard-to-audit coverage. | Authz doc §6 |
| G-27 | P2 | Search builds custodian links to the owner dashboard. | `src/app/api/v1/search/route.ts` (custodian link branch) | Broken/incorrect navigation and data exposure. | Authz doc §9 |
| G-28 | P2 | Public/staff property projections rely on per-route field lists; no shared serialiser. | `properties/route.ts`; `properties/[id]/route.ts` | New ownership/commission fields could leak. | Domain doc §10 |
| G-29 | P2 | No rate limit or abuse model for public listing/claim/broker surface. | Current only auth/inquiry-style limits | New public endpoints need explicit limits. | Marketplace doc §10 |

---

## 4. Marketplace and broker gaps

| ID | Severity | Gap | Evidence | Impact | Target |
| --- | --- | --- | --- | --- | --- |
| G-30 | P1 | Publication and availability are property-level, not unit-level. | `src/app/api/v1/properties/route.ts:52`; public page | A property with one vacant unit cannot advertise only that unit; occupied units can appear. | Marketplace doc §3 |
| G-31 | P1 | No listing lifecycle (`draft`, `active`, `paused`, `expired`, `let`). | none | No pause/expiry/renewal; no audit trail. | Marketplace doc §3.4 |
| G-32 | P1 | No listing publisher or co-publisher authorisation. | none | Admin and broker cannot both publish the same unit under controlled consent. | Marketplace doc §4 |
| G-33 | P1 | No acquisition attribution. Applications only carry applicant and property. | `Application` model | Cannot tell whether a tenant came from owner, admin, broker or platform. | Marketplace doc §6 |
| G-34 | P1 | No commission agreement, rate, basis, tax or payout state. | none | Broker work cannot be compensated transparently. | Marketplace doc §8 |
| G-35 | P1 | No broker-specific application/tenant visibility. | role model | Brokers would otherwise need broad tenant data to operate. | Marketplace doc §7 |
| G-36 | P2 | Public marketplace filters only property fields; unit rent/type/bedrooms not first-class. | `properties/route.ts`; `SearchFilters` | Poor unit search and stale property-level pricing. | Marketplace doc §3 |
| G-37 | P2 | No listing quality/moderation workflow. | none | Duplicate/misleading listings cannot be reviewed. | Marketplace doc §10 |
| G-38 | P2 | Unit favourites notify on `available` transition, not listing activation. | `lib/allocation.ts`; `UnitFavorite` | Notification semantics change when listings are introduced. | Marketplace doc §3.6 |

---

## 5. Financial gaps

| ID | Severity | Gap | Evidence | Impact | Target |
| --- | --- | --- | --- | --- | --- |
| G-39 | P1 | Invoice ownership is singular; there is no billing admin distinct from legal owner. | `Invoice.ownerId`; `invoice-generation.ts` | Multi-admin units cannot bill under the correct entity. | Domain doc §7 |
| G-40 | P1 | Service fee templates and overrides are owner/property scoped. | `ServiceFeeItem`; `UnitServiceFeeOverride` | Billing admin cannot own fees for units it manages. | Domain doc §7.4 |
| G-41 | P1 | Payment credentials and callback URLs are per owner. | `OwnerPaymentConfig`; M-Pesa callback | Admin/billing migration would break in-flight callbacks. | Migration doc §7 |
| G-42 | P1 | Invoice numbering counters live on `User` and are owner-keyed, while `invoiceNumber` is globally unique. Two owners can reserve the same `INV-YYYYMM-0001` sequence. | `src/lib/invoice-numbering.ts`; `src/models/Invoice.ts:95` | Admin consolidation and multi-admin billing collide or change sequences; existing numbers must not be rewritten. | Migration doc §6 |
| G-43 | P1 | No commission deductions or multi-party settlement. | `PaymentSplit` | Must not overload `PaymentSplit`; need separate accrual ledger. | Marketplace doc §8 |
| G-44 | P2 | `PaymentSplit` is best-effort and does not fail settlement. | `lib/payments/settle.ts:177-195` | Commission must not depend on it; use idempotent, recoverable accrual. | Marketplace doc §8.5 |
| G-45 | P2 | Amount handling is duplicated between major/minor boundaries. | `lib/amounts.ts`; payment routes | New commission math must use one rounding policy. | Marketplace doc §8.4 |

---

## 6. Notifications, documents and UX gaps

| ID | Severity | Gap | Evidence | Impact | Target |
| --- | --- | --- | --- | --- | --- |
| G-46 | P1 | Staff recipient type is literally owner/caretaker/custodian. | `lib/notifications.ts` recipient types | New admins, billing admins, brokers and system admins need explicit routing. | Domain doc §9 |
| G-47 | P1 | Dashboards and navigation are hard-coded per role. | `dashboardNav.ts`; `role-routes.ts` | New roles need new dashboards, redirects and deep-link handling. | Implementation doc §4 |
| G-48 | P1 | Documents have no ownership/custodian/share model beyond owner/tenant/property. | `PropertyDocument` | Admin/broker document access cannot be expressed. | Domain doc §9 |
| G-49 | P2 | Announcement audience is owner/property/tenant only. | `Announcement` | Admin and broker audiences unsupported. | Domain doc §9 |
| G-50 | P2 | Search result links and labels assume owner/caretaker only. | `search/route.ts` | New roles and duplicate property results need new result types. | Implementation doc §4 |

---

## 7. Testing, operations and migration gaps

| ID | Severity | Gap | Evidence | Impact | Target |
| --- | --- | --- | --- | --- | --- |
| G-51 | P1 | No e2e suite despite Playwright dependency. | package.json; no tracked Playwright config/specs | Multi-role end-to-end flows are unverified. | Implementation doc §6 |
| G-52 | P1 | No migration runner or applied-version tracking. | `scripts/*` | Cannot know which environments ran which backfill. | Migration doc §4 |
| G-53 | P1 | No transaction guarantee; critical flows use compensation. | `lib/allocation.ts`; deployment config | Migration and commission writes must be idempotent and resumable. | Migration doc §3 |
| G-54 | P1 | `npm run check` currently fails on pre-existing lint errors. | `use-service-fees.ts`; `ServiceFeesManager.tsx`; test file | Cannot use the documented gate as a clean baseline; must fix before implementation sign-off. | Implementation doc §6 |
| G-55 | P2 | No general audit/event table, metrics or reconciliation reports. | none | Commission disputes and migrations are hard to operate. | Implementation doc §7 |
| G-56 | P2 | Deploy job is a placeholder. | `.github/workflows/ci.yml:35-41` | No automated production release/rollback path. | Implementation doc §7 |

---

## 8. Priority order

### P0 — fix before or during the first implementation phase

1. Unit detail/summary/count cross-portfolio leaks (G-16, G-17, G-18).
2. Custodian document scope leak (G-19).
3. Add regression tests that prove the leaks are closed.

These are existing production risks and do not require the new domain model.

### P1 — required for the first redesign release

1. Canonical property/block/unit identity and dedupe (G-02, G-03).
2. Admin role plus `ManagementAssignment`; ownership separate (G-01, G-04, G-05).
3. Unit-level financial responsibility (G-06, G-39, G-40, G-41, G-42).
4. Unit-centric listings and listing lifecycle (G-09, G-30, G-31, G-32).
5. Broker identity and authorisation (G-10, G-11, G-33, G-35).
6. Commission ledger and payout states (G-12, G-34, G-43).
7. Central authorization policy and audit log (G-13, G-20–G-26).
8. Additive migration with compatibility window (G-14, G-52, G-53).

### P2 — after the core release is stable

- Dashboard polish and search (G-24, G-27, G-50).
- Full e2e suite and release automation (G-51, G-56).
- Listing moderation, richer filters, notifications and reports (G-36–G-38,
  G-46–G-49, G-55).

---

## 9. Explicit non-goals / constraints

- Do **not** rename every `ownerId` to `adminId` in place. Legal ownership and
  payment terminology must remain meaningful.
- Do **not** replace occupancy authority with a second writer.
- Do **not** make `PaymentSplit` the commission ledger.
- Do **not** require MongoDB transactions for the first migration; the current
  deployment may not support them.
- Do **not** delete legacy fields or records in the first release.
- Do **not** expose broker/commission data on public endpoints.

The next document defines the target domain model that closes these gaps.
