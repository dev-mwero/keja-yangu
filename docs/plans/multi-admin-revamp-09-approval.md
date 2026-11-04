# Keja Yangu — Approved Multi-Admin & Marketplace Revamp Plan

**Status:** Stage 1 complete — user authorizes P0 and Phase 1 implementation; Phases 2–9 remain unauthorized
**Approval date:** 2 November 2026
**Document type:** Consolidated product, architecture and implementation plan

---

## 1. Executive Summary

Keja Yangu will evolve from a predominantly single-owner-per-property management system into a multi-admin property management platform with scoped teams, a unit-level rental marketplace, independent publishers and brokers, and auditable commission attribution.

A physical property and its units must exist independently of the people authorised to manage them. Multiple admins may manage different scopes within the same property: the whole property, selected blocks, selected units, or combinations of those scopes.

Team members receive explicit permissions limited to their assigned scopes.

The marketplace will publish individual residential and commercial units. More than one authorised publisher may market the same unit. The first release will use one canonical listing and separate publisher-specific attribution records or share codes. Brokers must be authorised for the units they market.

Commission attribution must be traceable from publisher/referral through prospect, application, tenant, lease and first successful payment. Commission calculations may run in shadow mode initially; no actual commission settlement may be enabled until Legal and Finance approve the payer, tax, licensing and settlement rules.

This is a staged redesign, not a blanket role rename. Existing tenancy, payment, invoice, audit and occupancy behaviour must remain intact unless a separately approved change explicitly alters it.

## 2. Project Goals

1. Support multiple admins managing one physical property without duplicating the property or its units.
2. Support whole-property, block-level and unit-level management assignments, including mixed scopes.
3. Provide delegated, configurable permissions for custodians and caretakers.
4. Separate property identity, legal ownership, management authority and team membership.
5. Publish residential and commercial rental units through a public marketplace.
6. Allow multiple managers and brokers to market the same unit independently, with reliable attribution.
7. Prevent duplicate occupancy, unauthorised unit claims, tenant-data exposure and duplicate commission accruals.
8. Migrate existing owner accounts and portfolios safely, preserving historical records and access.
9. Deliver the redesign incrementally behind feature flags and with auditable migrations.

## 3. Non-Goals and First-Release Boundaries

- Do not perform a global textual replacement of `owner` with `admin`.
- Do not silently transfer units or management authority between users.
- Do not create duplicate physical properties, blocks or units to represent different administrators.
- Do not make legal ownership alone sufficient for dashboard access.
- Do not let brokers alter canonical rent, deposits or listing terms.
- Do not expose tenant contact details or internal tenancy information to brokers before the required consent or confirmed tenancy state.
- Do not route broker funds through Keja Yangu in the first release.
- Do not enable real broker commission payouts before Legal and Finance sign-off.
- Do not introduce simultaneous active leases for one tenant in the first release.
- Do not remove legacy fields or routes until compatibility, reconciliation and deprecation gates have passed.

## 4. Approved Business and Product Decisions

The decisions below consolidate the original requirements, the Stage 1 decision register and the user's acceptance of the recommended defaults.

### 4.1 Property Identity and Administration

| ID | Decision | Approved approach |
|---|---|---|
| P-01 | Physical property identity | A property exists independently of its admins. Match using name plus location/address and additional identity signals. Property name alone is insufficient. |
| P-02 | Existing property registration | Search for an existing property first. A user may immediately register units that are genuinely unclaimed within that property. Units already registered by another admin cannot be claimed or duplicated. |
| P-03 | Duplicate property handling | Use soft duplicate detection and a claim/dispute workflow. System-admin review handles disputes and merges. Do not rely on a hard unique address constraint in the first release. |
| P-04 | Admin scope | An admin may manage an entire property, blocks, selected units, or combinations of those scopes. |
| P-05 | Multiple admins | Multiple admins may manage different units or scopes within the same property. Assignments must not grant access to other admins' units. |
| P-06 | Property creation | Admin-only in the first release. Custodian/caretaker creation can be reconsidered later through an explicit portfolio-level permission. |
| P-07 | Legal ownership vs management | Legal ownership alone does not grant dashboard access. A legal owner who manages the property must receive an explicit admin assignment. |
| P-08 | Verification and disputes | Permit registration of unclaimed units. Flag reported disputes for system-admin review; do not silently overwrite or transfer an existing registration. |
| P-09 | Existing owner accounts | Migrate existing `owner` accounts to `admin` through a staged compatibility process. Preserve their existing portfolio through explicit assignments and communicate the role change. Preserve legal-owner wording in financial documents where appropriate. |

### 4.2 Team and Permissions

| ID | Decision | Approved approach |
|---|---|---|
| T-01 | Permission scope | Permissions may be granted at property, block and unit levels. Different privileges may apply at each scope. |
| T-02 | Custodian authority | A custodian is a trusted delegate, not a replacement super-admin. They cannot override admin-only decisions, self-grant permissions or delegate authority they do not hold. |
| T-03 | Custodian template | Provide a default custodian permission template that an admin can customise. |
| T-04 | Caretaker authority | Caretakers perform operational work only within assigned scopes and granted privileges. |
| T-05 | Delegation | A custodian may add/manage caretakers only where the custodian has an explicit delegation privilege. |
| T-06 | Admin authority | An admin has ultimate authority within their own assigned scope. Overrides must be authorised and audited. |
| T-07 | Revocation | Permission revocation must take effect on subsequent server requests; do not rely solely on stale JWT role or permission claims. |
| T-08 | Permission inheritance | Define and test inheritance explicitly. A broader grant may flow down only according to a documented policy; a narrow assignment must never broaden access. |

### 4.3 Marketplace and Listings

| ID | Decision | Approved approach |
|---|---|---|
| M-01 | Marketplace inventory | Listings are unit-centric and support residential and commercial units. |
| M-02 | Publisher eligibility | Admins, custodians and caretakers may publish only when their scope and explicit permissions allow it. |
| M-03 | Canonical listing | Maintain one canonical listing and canonical rental terms for a unit/availability period. |
| M-04 | Multiple publishers | Allow multiple authorised publishers to market the same canonical listing independently. Maintain publisher-specific records/share codes for attribution. |
| M-05 | Broker authorisation | A broker must obtain authorisation for each unit from an admin holding `broker:authorize` on that unit's scope. |
| M-06 | Exclusivity | Non-exclusive by default. No exclusive broker mandates in the first release. |
| M-07 | Co-admin decisions | Admins may act independently within their own granted scope; no additional co-admin consent is required by default. Record the acting admin and scope in the audit trail. |
| M-08 | Listing terms | An admin or authorised manager with `listing:publish` controls rent and canonical listing terms. Brokers cannot change them. |
| M-09 | Public location detail | Show county/estate/approximate area and suitable unit information. Hide exact plot, door and unit identifiers until the inquiry/approval process permits disclosure. |
| M-10 | Availability changes | When a unit is reserved or rented, suspend all active publisher channels for that unit, notify affected publishers and preserve listing history. |
| M-11 | Reservation model | Represent reservations as separate reservation records. Do not introduce a new `reserved` value into `Unit.status` in the first release. Keep reservation, occupancy and listing availability as distinct concepts. |
| M-12 | Re-publication | Do not automatically reactivate a suspended listing if its authorisation has expired or been revoked. Re-publication must revalidate availability, authority and terms. |
| M-13 | Legacy public pages | Keep existing public pages during the compatibility period. Redirect only after product and SEO sign-off. |

### 4.4 Broker Attribution and Commissions

| ID | Decision | Approved approach |
|---|---|---|
| B-01 | Broker role | Broker is a distinct platform role, not a caretaker/custodian team role. |
| B-02 | Broker verification | Require identity and business verification. Whether a statutory licence is mandatory must be confirmed by Legal; do not invent a licensing rule. |
| B-03 | Broker privacy | No tenant contact details or internal tenant data before the relevant consent or confirmed tenancy stage. |
| B-04 | Attribution model | Use last valid publisher touch within a 30-day attribution window. Lock attribution when the application is submitted. |
| B-05 | Provisional attribution | Use a 90-day configurable provisional attribution lifetime. |
| B-06 | Commission eligibility | A commission becomes eligible only after a tenant has signed an active lease and made the first successful payment. |
| B-07 | Existing tenants | No commission for an existing tenant unless a genuinely new tenancy is validly attributed and confirmed. |
| B-08 | Admin/platform-sourced tenants | No broker commission for direct admin- or platform-sourced tenants without valid broker attribution. |
| B-09 | Direct-vs-broker conflict | Do not overwrite locked attribution. Route disputes to system-admin review with an immutable decision trail. |
| B-10 | Commission scope for renewals | No commission on renewals by default; commission applies to the first tenancy from a confirmed attribution. |
| B-11 | Commission agreements | Support fixed and/or percentage-based agreement terms as configured per agreement. Snapshot the agreed terms when authorisation/attribution is established so later edits do not rewrite historical calculations. |
| B-12 | Commission payer/fund flow | Recommended model: the billing account pays the broker directly; Keja Yangu records and reconciles the obligation but does not hold or route the funds. This remains subject to Legal/Finance approval. |
| B-13 | Tax/withholding | Support configurable tax basis points and record gross, tax and net values. Legal/Finance must confirm the applicable rate, payer obligations and remittance treatment. |
| B-14 | Tax incidence | The draft recommendation is to withhold tax from gross broker commission, subject to Legal confirmation. |
| B-15 | Eligibility delay and clawback | Proposed default: eligible seven days after settled rent; refund within 30 days triggers clawback/reversal handling. Confirm with Finance before payout enablement. |
| B-16 | Payout cycle | Proposed monthly cycle with a configurable minimum threshold; Finance must set the operational values. |
| B-17 | Shadow mode | Launch listings and broker attribution before real commission settlement. Commission calculations may run in shadow mode for validation. |
| B-18 | Payout authority | Use `system-admin` for initial payout operations. A dedicated finance role may be considered later. |
| B-19 | Historical commissions | Do not assume commissions are owed for tenancies created before the commission feature is enabled. |
| B-20 | Retention | Retain attribution and commission records according to the approved Finance/Legal retention policy, including after broker removal. |

### 4.5 Existing Billing and Operational Decisions

| ID | Decision | Approved approach |
|---|---|---|
| O-01 | Tenant lease cardinality | Keep one active lease per tenant in the first release. |
| O-02 | Property-level invoices | Continue supporting manual property-level invoices for adjustments where no unit is required. |
| O-03 | Invoice numbering | Preserve all historical invoice numbers. New numbering may follow `${prefix}-${YYYYMM}-${seq}` after collision/preflight checks. |
| O-04 | Audit retention | Proposed minimum of two years, subject to legal/regulatory review. |
| O-05 | Platform finance role | Use `system-admin` initially for payout operations; do not merge `system-admin` with the new `admin` role. |
| O-06 | Currency | KES-only is a working first-release assumption; verify current code and product requirements before treating it as a hard constraint. |

### 4.6 External Confirmation Required Before Payouts

These are accepted engineering defaults, not final legal or financial approvals:

- Commission payer and direct-payment workflow.
- Broker licensing requirements.
- Applicable tax rate, withholding, reporting and remittance obligations.
- Seven-day eligibility delay and 30-day refund clawback window.
- Monthly payout cycle and minimum payout threshold.
- Required retention periods for financial and attribution records.

If these confirmations are not available, keep commission in shadow mode or remove payout functionality from the release scope.

## 5. Domain Model Principles

The coding agent must validate these principles against the repository and propose concrete schemas only after inspecting the existing models.

### 5.1 Separate Identity, Ownership and Authority

Keep these concepts distinct:

- **User:** login identity and authentication principal.
- **Property:** physical property identity.
- **Block:** a structural subdivision of a property.
- **Unit:** a rentable physical unit.
- **Legal ownership:** a legal/evidentiary relationship; it does not automatically grant application access.
- **Admin assignment:** an explicit relationship granting management authority over a property or a defined scope.
- **Team membership:** a custodian/caretaker relationship with scope and permissions.
- **Permission grant:** an action allowed on a resource scope.

Do not use a single `ownerId` field as the universal source of physical property identity, legal ownership, management assignment and access control.

### 5.2 Scope and Permission Evaluation

The authorisation model must support:

- Property-wide assignments.
- Block assignments.
- Individual unit assignments.
- Multiple assignments for the same admin.
- Different permissions at different scopes.
- Team delegation constrained by the delegator's own authority.
- Explicit deny/precedence rules where grants overlap.
- Immediate effect of revocation on subsequent server requests.

All sensitive operations must resolve permission on the server against the target resource and its current assignment hierarchy. Hiding UI controls is not authorisation.

### 5.3 Listing, Publisher and Broker Separation

Keep separate records/concepts for:

- Physical unit.
- Unit availability.
- Reservation.
- Canonical listing and its rental terms.
- Publisher channel/share code.
- Broker authorisation and agreed commission terms.
- Prospect/lead and inquiry.
- Application and locked attribution.
- Tenant.
- Lease.
- First successful payment.
- Commission calculation, eligibility, approval, payable state, payment and reversal/dispute.

One canonical listing may have multiple publisher channels. A publisher channel must not create a second physical unit or independent competing rent/terms for the same availability period.

### 5.4 Attribution Integrity

Attribution must be server-validated and auditable. Do not trust a client-supplied broker ID or referral value as proof of commission entitlement.

The implementation must define and test:

- Valid publisher touch and 30-day last-touch window.
- 90-day provisional attribution lifetime.
- Application submission lock.
- Duplicate prospect/tenant handling.
- Existing tenant handling.
- Direct tenant and admin/platform-sourced cases.
- Expired or revoked broker authorisation.
- Multiple brokers/publishers touching one prospect.
- Disputes after attribution lock.
- Refunds, reversals and clawbacks.
- Idempotent commission accrual on repeated payment callbacks.

The exact precedence for edge cases must be documented before commission payouts are enabled.

## 6. Existing Technical Constraints to Preserve

These are known architectural constraints from the existing project context. The coding agent must verify each against the current repository and record any discrepancy.

- Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4 and shadcn/ui/Radix.
- MongoDB/Mongoose 9; Zod 4 and React Hook Form; Vitest; Biome.
- A single Next.js application serves public pages, dashboards and REST APIs under `/api/v1`.
- `src/proxy.ts` performs Next.js 16 request gating.
- `src/lib/permissions.ts` contains existing RBAC logic.
- Models are in `src/models`; domain services in `src/lib`; API routes in `src/app/api/v1`; frontend hooks in `src/hooks`.
- `User._id` is the login identity.
- `Tenant._id` is the tenant membership record.
- Lease, invoice, payment, complaint, chat and move-request tenant references generally use `Tenant._id`.
- `Unit.tenantId[]` stores occupant `User._id` values.
- `Lease.unitId` is the authoritative occupancy pointer.
- `src/lib/allocation.ts` is the sole authority for unit allocation/vacating and occupancy cache changes.
- `src/lib/service-fees.ts` is the authoritative service-fee resolver.
- Preserve invoice snapshots, payment idempotency, payment split logic, provider callbacks, soft-delete/recycle-bin semantics and audit history.
- Paystack is global; Daraja/M-Pesa configuration is per admin and encrypted at rest.
- Existing roles include `tenant`, `caretaker`, `custodian`, `owner` and `system-admin`. The new `admin` role must remain distinct from `system-admin`.

**Critical migration rule:** `owner` role literals and `ownerId` references have different meanings. The source register cites 327 role literals and 948 `ownerId` references; verify exact current counts. Do not globally rename them. Classify each use by domain meaning before changing it.

## 7. Migration and Compatibility Principles

1. Produce a baseline inventory of users, properties, blocks, units, ownership references, assignments, active leases, invoices, payments and callbacks.
2. Define an explicit source-of-truth matrix for every migrated field.
3. Build a dry-run migration that reports proposed changes without writing.
4. Preserve existing document IDs wherever safe and semantically correct.
5. Reuse embedded block/floor IDs only after verifying their consistency and references.
6. Create admin assignments from verified legacy ownership/management relationships; do not infer access from ambiguous `ownerId` references.
7. Keep legacy role/field compatibility during the transition. Use a controlled alias or adapter where required.
8. Make migration steps idempotent and checkpointed.
9. Build unique indexes only after duplicate-data preflight and remediation.
10. Do not depend on MongoDB transactions being available. Use idempotency, checkpoints, compensating actions and reconciliation.
11. Preserve payment callback compatibility for in-flight transactions; deploy compatible handlers before switching writers.
12. Never rewrite historical invoice/payment amounts or snapshots as part of the role/property migration.
13. Keep a rollback path and verify backup restoration before production migration.
14. Remove legacy fields only after a documented compatibility period, successful reconciliation and explicit approval.

## 8. Phased Implementation Roadmap

The phases below are sequencing guidance. The Stage 1 audit must confirm, adjust and estimate them against the actual repository. No phase authorises production deployment by itself.

### Stage 1 — Repository Audit and Approved Design Package

**Status: Complete 2 November 2026; Phase 0 implementation remains unauthorized.**

Deliverables under `docs/plans/`:

1. Current architecture audit.
2. Gap analysis against this approved plan.
3. Proposed domain model and ER diagram.
4. Proposed authorisation architecture, including permission matrix and scope inheritance.
5. Marketplace/broker architecture, including sequence diagrams for publishing, inquiry, application, attribution, lease, first payment and commission shadow calculation.
6. Migration and compatibility plan.
7. Phased implementation plan with dependencies, test gates and rollback strategy.
8. Open questions, risks, assumptions and decision register updated to reflect approvals and remaining external sign-offs.

The audit must inspect actual models, schemas, route handlers, middleware/proxy, services, hooks, dashboards, payment integrations, tests, indexes and deployment configuration. It must distinguish confirmed code facts from intended architecture and recommendations.

**Stage 1 exit:** Present the eight documents and stop. Do not modify production code, database schemas, migrations or runtime behaviour during this stage.

#### Stage 1 completion record — 2 November 2026

- All eight Stage 1 documents (`multi-admin-revamp-01` through `-08`) were
  reviewed and reconciled against this approved design and the current
  repository. The verified implementation snapshot and counts are recorded in
  `multi-admin-revamp-01-architecture-audit.md` and
  `multi-admin-revamp-02-gap-analysis.md`.
- Verification: `npm run typecheck` passed; `npm run test` passed (173 files,
  1,698 tests); read-only `npx biome check .` reported one warning in
  `src/hooks/use-service-fees.ts`. `npm run check` is write-enabled and was not
  used.
- No production code, schema, migration or runtime changes were made as part of
  Stage 1. No staging/production data, backup/restore drill or financial
  checksum was available to verify.
- Remaining before production migration/deployment: staging and backup/restore
  verification; named migration/rollback owners and feature-flag ownership.
  Legal/Finance confirmation is required before payouts; Legal's
  statutory broker-licence determination; and Product clarification of the
  commission basis/cap difference noted in `multi-admin-revamp-08-open-questions-risks.md`.

#### Subsequent authorization — 2 November 2026

The user explicitly approved the current P0 plans and Phase 1 and instructed
implementation to begin. This supersedes the earlier implementation hold for
Phase 0 P0 work and Phase 1 only. Phases 2–9, production data migration, and
commission payouts remain unauthorized until their respective gates are met.

### Phase 0 — Security and Baseline Stabilisation

- Identify and fix existing P0 security/data-leak issues as a separate, tightly scoped release.
- Establish current test, lint and type-check baselines.
- Add or repair critical role/resource authorisation tests.
- Establish Playwright end-to-end coverage for critical existing flows and multi-role regression paths.
- Confirm backup/restore and staging clone.
- Add observability and audit coverage needed for migration.

**Gate:** P0 issues resolved or explicitly risk-accepted; baseline tests and rollback procedures pass.

### Phase 1 — Identity, Roles and Scoped Authorisation Foundation

- Introduce the new `admin` role without conflating it with `system-admin`.
- Implement explicit property/block/unit admin assignments.
- Implement central, server-side permission evaluation.
- Define inheritance and deny/precedence rules.
- Implement custodian/caretaker team membership and delegated permissions.
- Ensure revocation is effective on subsequent requests.
- Preserve legacy compatibility while routes and services are migrated.
- Enforce the legal-owner access rule: ownership alone is not dashboard access.

**Gate:** Automated allow/deny matrix covers every role and scope; no cross-admin access; legacy owner users retain intended access.

### Phase 2 — Property Identity, Registration and Deduplication

- Implement property search and identity matching using multiple identity signals.
- Support selection of existing properties.
- Support adding blocks where appropriate.
- Permit immediate registration of unclaimed units.
- Prevent claiming or duplicating already registered units.
- Implement duplicate-property signals, claims/disputes and system-admin merge workflow.
- Preserve property, block, floor and unit references.

**Gate:** Concurrent registration tests prove duplicate unit claims cannot succeed; dispute and merge flows are audited and recoverable.

### Phase 3 — Existing Property-Management and Billing Compatibility

- Migrate existing owner portfolios to explicit admin assignments.
- Reconcile block/unit relationships and any embedded block mirrors.
- Preserve tenant identity/reference semantics.
- Preserve lease occupancy authority through `Lease.unitId` and `allocation.ts`.
- Preserve invoice numbering and historical snapshots.
- Preserve service-fee resolution and payment idempotency.
- Retain manual property-level invoices for adjustments.
- Verify payment provider callbacks and in-flight transactions.

**Gate:** Reconciliation reports show no unexplained loss, duplication or access drift in tenancy and financial records.

**Current authorization:** local P0 and Phase 1 code/test work is approved;
production migration and deployment remain gated by staging, backup/restore,
and the operational approvals above.

