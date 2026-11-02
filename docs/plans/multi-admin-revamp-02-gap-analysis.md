# Stage 1 — Gap Analysis

**Status:** Stage 1 complete; P0 and Phase 1 implementation authorized 2026-11-02
**Date:** 2026-11-01; repository reconciliation: 2026-11-02
**Baseline:** `multi-admin-revamp-01-architecture-audit.md`  
**Purpose:** Compare the requested multi-admin marketplace/broker product with
the current implementation and prioritise the work.

Severity:

- **P0** — security, data-integrity or migration blocker.
- **P1** — required to deliver the requested product.
- **P2** — important operational/UX improvement, can follow the first release.

> The gap rows below preserve the 2026-11-01 audit findings. See §10 for their
> verified current disposition; that reconciliation takes precedence.

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
| Central, testable authorization | Legacy guard plus new assignment policy/enforcement adapter | Partial |
| Immutable audit log | `AuditEvent` and audit helper exist; coverage is limited | Partial |
| Safe migration from owner model | Greenfield `ownerId` everywhere | Missing |

---

## 2. Domain and data-model gaps

| ID | Severity | Gap | Evidence | Impact | Target |
| --- | --- | --- | --- | --- | --- |
| G-01 | P1 | Property is bound to a single `ownerId`, which doubles as manager and payee. | `src/models/Property.ts:45`; `src/lib/permissions.ts` owner scope | Cannot represent multiple admins or a manager independent of ownership. | Domain doc §3–4 |
| G-02 | P1 | No block collection. Blocks/floors are embedded in `Property.blocks[]`; units reference embedded ids. | `src/models/Property.ts:63`; `src/lib/property-structure.ts` | Two admins cannot independently add blocks to the same property; no cross-property block uniqueness. | Domain doc §5 |
| G-03 | P1 | No physical property identity/dedupe. No county, street, plot number, geocode or normalised address. | `src/models/Property.ts` | Duplicate properties are likely as admins self-register; cannot merge safely. | Domain doc §3.3 |
| G-04 | P1 | No ownership-interest model. Legal owners, landlords and managers are conflated. | `Property.ownerId`; `Invoice.ownerId`; `PaymentSplit` | Rent payee cannot differ from manager; multiple co-owners unsupported. | Domain doc §6 |
| G-05 | P1 | Assignment foundation exists, but it is not the universal source of staff authority. | `ManagementAssignment`, `lib/authorization.ts`, `lib/assignments.ts`, route-family enforcement | Legacy route checks and owner-derived scope remain; multi-admin access is not complete. | Domain doc §4 |
| G-06 | P1 | No per-unit financial responsibility. Fees, payment credentials and invoice numbers are owner-scoped. | `OwnerPaymentConfig`; `ServiceFeeItem.ownerId`; `invoice-numbering.ts` | Different admins cannot bill different units under a common property. | Domain doc §7 |
| G-07 | P1 | `Unit.tenantId[]` is a denormalised occupant cache; `Lease.unitId` is authoritative. | `src/models/Unit.ts:44`; `src/lib/allocation.ts` | Block/unit merges and admin transfer can corrupt occupancy if caches are copied without reconciliation. | Domain doc §5.6 |
| G-08 | P1 | Current lease uniqueness supports one active lease per tenant; allocation repoints it rather than creating a second lease. | `src/models/Lease.ts`; `src/lib/allocation.ts:132-153` | "Multi-unit tenant" is not actually implemented and must not be assumed by the redesign. | Domain doc §6; D-16 |
| G-09 | P1 | No listing entity. Public status is `Property.published` + `Property.status`. | `src/models/Property.ts`; `src/app/api/v1/properties/route.ts:52` | Unit-level availability, pricing and publication cannot be represented. | Domain doc §8 |
| G-10 | P1 | No publisher/attribution model. | No matches for `broker|commission|attribution|referral` | Cannot reward a broker or track who sourced a tenant. | Marketplace doc §4–7 |
| G-11 | P1 | No broker identity, verification, licence or contract state. | `User.role` excludes broker | Broker cannot register, be approved or act within scope. | Marketplace doc §5 |
| G-12 | P1 | No commission ledger. `PaymentSplit` only distinguishes rent and service charge. | `src/models/PaymentSplit.ts` | Commission cannot be accrued, reversed or paid without corrupting settlement. | Marketplace doc §8 |
| G-13 | P1 | `AuditEvent` exists, but not every privileged change emits an audit event. | `models/AuditEvent.ts`; `lib/audit.ts`; assignment services | Listing, ownership, attribution and commission workflows still need comprehensive audit coverage. | Authz doc §8 |
| G-14 | P1 | No schema/migration versioning. Scripts are ad hoc. | `scripts/*`, no migration runner | Large owner→admin migration cannot be tracked or safely rolled back. | Migration doc §4 |
| G-15 | P2 | `Unit` has no explicit block/floor snapshot beyond ids/names; names can drift. | `src/models/Unit.ts`; `property-structure.ts` | Reports may show stale block/floor names after structure edits. | Domain doc §5.5 |

---

## 3. Authorization and security gaps

| ID | Severity | Gap | Evidence | Impact | Target |
| --- | --- | --- | --- | --- | --- |
| G-16 | **P0 — closed in code** | Public property detail now limits unauthenticated responses to available units; all-unit data requires a manager role. | `src/app/api/v1/properties/[id]/route.ts` | Regression coverage exists; include this route in the pre-release security check. | Marketplace doc §9 |
| G-17 | **P0 — closed in code** | Unit summary now calls scoped `unit:read` permission checks for managers. | `src/lib/permissions.ts`; `unit-summary/route.ts` | Caretaker access is checked against assigned properties. | Authz doc §4 |
| G-18 | **P0 — closed in code** | Unit counts now require authentication and scoped `unit:read`. | `unit-counts/route.ts`; `src/lib/permissions.ts` | Cross-portfolio count disclosure is addressed in the current handler. | Authz doc §4 |
| G-19 | **P0 — closed in code** | Custodian document reads now filter by their managing owner. | `src/app/api/v1/documents/route.ts` | Keep role-specific document-scope tests in the Phase 0 gate. | Authz doc §4 |
| G-20 | P1 — legacy-path scope fixed | Caretaker application management now checks the assigned property through `caretakerAssignedToProperty`. | `src/lib/permissions.ts`; application route | New central policy integration remains incomplete. | Authz doc §5 |
| G-21 | P1 — legacy-path scope fixed | Caretaker move-request management now checks the assigned property. | `src/lib/permissions.ts`; move-request route | New central policy integration remains incomplete. | Authz doc §5 |
| G-22 | P1 — legacy-path scope fixed | Caretaker unit management now checks the assigned property. | `src/lib/permissions.ts`; unit route | New central policy integration remains incomplete. | Authz doc §5 |
| G-23 | P1 | `requirePermission` is action-specific and easy to bypass with a missing or incomplete resource. Several actions deliberately return `null` without a resource. | `permissions.ts` | New routes can ship with accidental cross-scope access. | Authz doc §6 |
| G-24 | P1 — fixed in code | `getDashboardAllowedRoles` matches dashboard prefixes, including nested pages. | `src/lib/role-routes.ts`; dashboard layout | API authorization remains the security boundary. | Authz doc §9 |
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

### P0 — code fixes present; release gate remains

As of 2026-11-02, code fixes for the public-unit, summary/count and custodian
document-scope findings (G-16–G-19) are present, and the full Vitest suite
passes. Phase 0 must re-run the relevant regression tests and handle release,
monitoring and risk acceptance; this audit does not claim a production release.

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

## 10. Current disposition (2026-11-02)

- The Phase 0 P0 findings G-16–G-19 have corresponding code fixes. G-20–G-22
  caretaker assigned-property checks and G-24 nested dashboard role matching
  are also fixed in the legacy path.
- Phase 1 is partially implemented: admin role scaffolding, assignment,
  ownership and claim models, policy/resource loaders, assignment APIs,
  capability endpoint, audit helper, shadow/enforcement adapter and assignment
  backfill exist. Universal route enforcement, complete workflows, migration
  execution and comprehensive audit coverage do not.
- Phases 2–9 remain planned, not complete. In particular, canonical block and
  billing domains, unit listings, broker onboarding/authorisation, attribution,
  commission and legacy retirement are absent or incomplete. See §8 of the
  current architecture audit for the full repository inventory and test
  baseline.

This document records approved design direction, not implementation
authorization. Phase 0 remains gated by approval 09 and the remaining
operational/external confirmations.
