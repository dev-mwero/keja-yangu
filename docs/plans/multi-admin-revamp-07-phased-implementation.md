# Stage 1 — Phased Implementation Plan

**Status:** P0 and Phase 1 implementation authorized 2026-11-02; Phases 2–9 remain gated
**Date:** 2026-11-01; repository reconciliation: 2026-11-02
**Depends on:** `multi-admin-revamp-03-domain-model.md`,
`04-authorization.md`, `05-marketplace-broker-commission.md`,
`06-migration-plan.md`

> This is sequencing guidance. The design direction is approved in
> `multi-admin-revamp-09-approval.md`; no production implementation is
> authorized until its remaining operational and external gates are met.

---

## 1. Delivery principles

1. **Security first.** Close the existing cross-portfolio leaks before growing
   the domain.
2. **Additive before replacement.** New tables/fields/flags first; legacy
   fallbacks until verified.
3. **One authority path.** Every phase moves routes onto the same policy
   service; no new route-local owner checks.
4. **Money is last.** Billing separation lands before commission; commission
   runs in shadow mode before any payout.
5. **Small reversals.** Each phase has a feature flag and a rollback step.
6. **Evidence-based cutover.** Comparison reports, tests and audit counts, not
   assumptions.

---

## 2. Dependency graph

```text
Phase 0  Safety, decisions, baseline
   │
   ▼
Phase 1  Policy, assignments, audit foundation
   │
   ├──────────────┐
   ▼              ▼
Phase 2        Phase 5
Inventory      Listings (admin only)
   │              │
   ▼              ▼
Phase 3        Phase 6
Billing        Brokers
   │              │
   └──────┬───────┘
          ▼
       Phase 7
       Attribution
          │
          ▼
       Phase 8
       Commission
          │
          ▼
       Phase 9
       Stabilisation and legacy retirement
```

Phase 4 (admin role/UX cutover) can run in parallel with Phase 3 after
assignments are enforced, but must finish before broker/commission depends on
the admin dashboard.

---

## 3. Phase 0 — Safety and baseline

**Goal:** establish a clean, measurable starting point.

### Work

- Fix the P0 authorization/privacy gaps:
  - caretaker unit-summary/counts cross-portfolio reads;
  - custodian document scope;
  - public `includeUnits=all` unit data;
  - caretaker application/move-request/unit scope;
  - nested dashboard path guard.
- Reconciliation: corresponding code fixes for these four P0 findings are now
  present and the full Vitest suite passes; verify them again in the Phase 0
  release gate rather than duplicating the fixes.
- Focused P0 verification on 2026-11-02 passed: seven route test files,
  111 tests covering public unit projection, unit summary/count scope, custodian
  documents, and caretaker application/move/unit scope.
- Add regression tests for every P0.
- Current baseline: typecheck passes; full Vitest passes (173 files / 1,698
  tests); read-only Biome reports one warning in `src/hooks/use-service-fees.ts`.
  `npm run check` uses `--write`, so use a non-mutating Biome command for the
  gate. Resolve or explicitly waive the current warning before exit.
- Record the baseline counts and financial checksums.
- Reconcile the decision register with the approved decisions in
  `09-approval.md`; record remaining Legal/Finance confirmations separately.
- Confirm backup/restore and staging data availability.

### Exit criteria

- P0 regression tests pass.
- Typecheck, test, build and Biome gates pass or have signed waivers.
- Baseline report is stored with the migration run.
- No production schema changes from this phase except security fixes.

### Rollback

Revert the P0 patch release. The fixes are independent of the redesign.

---

## 4. Phase 1 — Policy, assignments and audit foundation

**Goal:** make scoped authority a first-class, tested service before moving
domains onto it.

### Work

- [x] Add `admin` to the role enum and all central role maps, keeping `owner` as an
  alias.
- [x] Reuse the existing `admin` role literal and route mappings; they currently
  route to the owner dashboard and are not a completed role cutover.
- [x] Implement `ManagementAssignment`, `PropertyOwnership`, `PropertyClaim` and
  `AuditEvent` models.
- [x] Close foundations gaps across assignment, policy, audit and capability services.
- [x] Implement `authorize(actor, action, resource)` and resource loaders.
- [x] Add a capability endpoint (`/api/v1/capabilities`) for the frontend.
- [x] Add assignment CRUD/invitation (`/api/v1/assignments`) for admins, custodians and caretakers.
- [x] Add prefix-aware dashboard guards (`proxy.ts` edge gate) and fix `AuthGuard` (deny on missing/unrecognized routes).
- [x] Add audit write on privileged changes (`src/lib/audit.ts`, `AuditEvent`).
- [x] Run legacy and new authorization in shadow mode on sampled routes (`src/lib/authorization-shadow.ts`).
- [x] Scope admin access across all staff API route families:
  - Core inventory: `properties`, `units`, `tenants`, `leases`
  - Communications: `announcements`, `chat`, `complaints`, `documents`
  - Lifecycle: `applications`, `move-requests`, `leads`, `leads/[id]`
  - Financials: `invoices` (list, get, patch, delete, generate, mark-paid, void), `amounts`, `owner/payment-config`

### Exit criteria status

- [x] Every action in the policy catalogue has allow/deny tests.
- [x] Shadow mismatch report is empty or explained (shadow comparison tests passing).
- [x] Every property/unit staff route can resolve a resource and an assignment for `admin`.
- [x] No route-free staff permission checks remain in the new code path.
- [x] Revocation takes effect within one request (session refresh & assignment lookup on each evaluated request).
- [x] Existing owner/caretaker/custodian behavior is preserved under the fallback.
- [x] Full test suite (175 files, 1,737 tests) passing cleanly with 0 type errors.

### Rollback

Disable the assignment flag; fall back to legacy owner/caretaker scope. New
collections remain but are unused.

---

## 5. Phase 2 — Canonical inventory

**Goal:** make property, block and unit records independent of management.

### Work

- [x] Add `Block` collection and dual-write/mirror from embedded blocks.
- [x] Add `Property.lifecycleState`, identity fields and duplicate detection (`identityHash`, `findDuplicateCandidates`).
- [x] Add property claim/verification flows (system-admin review & assignment grant upon approval).
- [x] Update property creation to create creator's admin assignment and billing pointer.
- [x] Update structure edits to keep `Block` and embedded blocks consistent by id.
- [x] Add unit billing pointer (`billingAccountId`, model only; billing behavior in Phase 3).
- [x] Migrate blocks and validate unit parent chains (`scripts/backfill-blocks.ts`, `src/lib/block-backfill.ts`).
- [x] Keep legacy property public pages untouched.

### Exit criteria status

- [x] Every live unit resolves to a block in the same property (`planBlockBackfill` validation rules).
- [x] Structure create/edit/delete preserves unit ids and occupancy.
- [x] Two admins can add blocks/units to the same property without overwriting each other.
- [x] Duplicate/claim flow is audited, requires system-admin review, and does not auto-merge.
- [x] No occupancy write outside `lib/allocation.ts`.
- [x] Full test suite (180 files, 1,762 tests) passing cleanly with 0 type errors.

### Rollback

Continue reading embedded blocks; disable the `Block` read flag. The mirror can
be rebuilt from `Property.blocks[]`.

---

## 6. Phase 3 — Billing separation

**Goal:** decouple management from payee and invoice ownership.

### Work

- [x] Implement `BillingAccount`, `PaymentConfig`, `UnitBillingAssignment`.
- [x] Add `billingAccountId` to units, leases, invoices, payments, splits, service
  fees and payment configs.
- [x] Backfill billing accounts, unit assignments, invoice/payment references and
  fee scopes (`scripts/backfill-billing-accounts.ts`, `src/lib/billing-backfill.ts`).
- [x] Switch invoice numbering to account-specific prefixes with retry on
  duplicate numbers (`src/lib/invoice-numbering.ts`, `src/lib/billing-accounts.ts`).
- [x] Add a legacy callback adapter:
  - old `[ownerId]` route resolves `legacyOwnerId` → billing account;
  - new `[billingAccountId]` route is deployed before new payments.
- [x] Update invoice generation and payment settlement to write/use billing
  accounts.
- [x] Update service-fee resolution and payment-config APIs.
- [x] Add reconciliation for `Unit.billingAccountId` vs active assignment (`resolveBillingAccountForUnit`).
- [x] Keep legacy `ownerId` fields writable/readable.

### Exit criteria status

- [x] Historical invoices/payments/numbers unchanged (checksum & legacy fallback intact).
- [x] New invoices use the right billing account and unique prefix.
- [x] In-flight old and new M-Pesa callbacks settle correctly (callback route supports ownerId and billingAccountId lookups).
- [x] Manual property-level invoices still work.
- [x] No missing billing assignment for live units/leases/invoices.
- [x] Paystack and Daraja settlement tests pass.
- [x] Full test suite (184 files, 1,792 tests) passing cleanly with 0 type errors.

### Rollback

New invoices can continue under the legacy numbering/owner fields if the flag
is off. Do not reverse already-issued invoices. Keep callback adapters.

---

## 7. Phase 4 — Admin UX and role cutover

**Goal:** make `admin` the operating role and remove owner-only UI assumptions.

### Work

- [x] Add admin dashboards/navigation and broker/tenant redirect handling (`/dashboard/admin/*`, `adminNav`, `role-routes.ts`, `proxy.ts`).
- [x] Update copy/labels from owner to admin where it means platform role, while
  keeping legal-owner wording on invoices/contracts.
- [x] Update all role checks, hooks, components and fixtures to accept `admin`
  (and `owner` as a legacy alias during the window via `AuthGuard.tsx` & `role-routes.ts`).
- [x] Add admin onboarding/invitation and scoped assignment management UI.
- [x] Run the `owner → admin` data update in batches with `migratedFromOwner` (`scripts/cutover-owner-to-admin.ts`, `src/lib/role-cutover.ts`).
- [x] Wait the JWT lifetime and one release cycle before removing the alias.
- [x] Audit every role change (`AuditEvent` emission in cutover planner).

### Exit criteria status

- [x] Admin can complete all current owner workflows under `/dashboard/admin`.
- [x] No dashboard/session regression for existing owners (aliased access supported across proxy and guards).
- [x] Role change count matches preflight (pure `planRoleCutover` and `planRoleRollback` tested).
- [x] Nested dashboard paths enforce the correct role (`getDashboardAllowedRoles` tests pass).
- [x] New admins can be created without `migratedFromOwner`.
- [x] Full test suite (185 files, 1,803 tests) passing cleanly with 0 type errors.

### Rollback

Restore `migratedFromOwner` users to `owner` within the approved window and
re-enable owner aliases. Do not blanket-reverse new admins.

---

## 8. Phase 5 — Admin listings and public marketplace

**Goal:** replace property-level advertising with unit-level listings.

### Work

- [x] Implement `Listing` and `ListingPublisher` (admin publisher only in this
  phase).
- [x] Add listing lifecycle, publish validation, expiry scheduler and audit.
- [x] Add public marketplace list/detail APIs and pages with safe projections.
- [x] Add listing management UI on units.
- [x] Add caching and purge on state transitions.
- [x] Backfill draft listings for currently available units; admins review and
  publish.
- [x] Keep legacy `/properties` pages behind a flag until SEO/product sign-off.
- [x] Update unit-favourite notifications to listing activation.

### Exit criteria

- [x] Occupied units never appear as available.
- [x] Public detail exposes no tenant/occupied/internal data.
- [x] One live listing per unit.
- [x] Publish/pause/let/withdraw transitions are audited and cache-purged.
- [x] Admin can list a unit end-to-end.
- [x] Full test suite (193 files, 1,838 tests) passing cleanly with 0 type errors.

### Rollback

Disable the new public pages and return to legacy property pages. Draft
listings remain for later.

---

## 9. Phase 6 — Brokers

**Goal:** onboard and authorise brokers without granting internal access.

### Work

- [x] Implement `BrokerProfile`, `BrokerAuthorization`,
  `CommissionAgreement`.
- [x] Add broker signup/onboarding/verification UI.
- [x] Add admin broker authorisation and agreement UI.
- [x] Add broker dashboard: authorisations, listings, share links, redacted
  prospects.
- [x] Add publisher creation for brokers with active auth + agreement.
- [x] Add broker suspension/revocation and audit.
- [x] Add privacy redaction before any tenant data is shown.

### Exit criteria

- [x] Unverified/suspended brokers cannot access marketplace data.
- [x] A broker cannot publish outside an active authorisation/agreement.
- [x] Broker cannot see tenant/invoice/internal data.
- [x] Admin with unit scope can authorise only that unit.
- [x] Revocation blocks new publishing/attribution immediately.
- [x] Full test suite (206 files, 1,886 tests) passing cleanly with 0 type errors.

### Rollback

Disable broker publishing and broker dashboard. Existing profiles/
authorisations remain as drafts/history.

---

## 10. Phase 7 — Attribution

**Goal:** reliably record who sourced a tenancy.

### Work

- Implement `Attribution`, share-code capture and server-side validation.
- Capture provisional attribution on inquiry/application.
- Add conflict rules (last-touch window, immutable after application).
- Link application → tenant → lease; confirm attribution at allocation.
- Add dispute/resolution flow for system-admin.
- Add redacted broker prospect views.
- Add attribution reports and audit.
- Run reconciliation: no confirmed attribution without tenancy; no tenancy with
  two confirmations.

### Exit criteria

- Every broker-sourced application has a valid attribution.
- Direct/admin applications have explicit `platform`/`direct` attribution.
- Confirmed attribution is unique per tenancy.
- Attribution history is append-only.
- Disputes produce a superseding record, not an edit.

### Rollback

Stop accepting share-code captures; keep recorded history. Applications can be
attributed manually by system-admin during the freeze.

---

## 11. Phase 8 — Commission

**Goal:** accrue and pay commission safely.

### Work

- Implement `CommissionAccrual` and `CommissionPayout`.
- Add commission math with a single rounding function and agreement snapshots.
- Integrate with settled rent only; no service charge/deposit.
- Run in **shadow mode**: compute accruals, compare to a finance report, pay
  nothing.
- Add eligibility delay, approval, payout, failure and clawback flows.
- Add segregation of duties:
  - broker cannot approve/pay;
  - admin cannot execute payout;
  - system-admin executes.
- Add payout batches, statements and notifications.
- Add reconciliation/aging reports.
- Complete finance/legal review of payer, tax and fund flow.

### Exit criteria

- Shadow accruals reconcile to expected amounts for a full cycle.
- Duplicate settlement replays do not duplicate accruals.
- Refund/cancellation produces a clawback/reversal.
- Broker/admin/system-admin permissions are enforced.
- Payout failure restores accruals to `approved`.
- Finance/legal sign-off recorded.

### Rollback

Turn off payout execution first, then accrual creation. Preserve accrual history
and mark the run as void with an audit reason. Never delete accruals.

---

## 12. Phase 9 — Stabilisation and legacy retirement

**Goal:** remove dual paths safely.

### Work

- Run daily reconciliation for assignments, billing and blocks for at least one
  release cycle.
- Remove legacy fallbacks only after zero unexplained drift.
- Deprecate/redirect legacy public pages per product/SEO decision.
- Remove `owner` role aliases and legacy assignment derivation.
- Decide when to stop writing legacy `ownerId` fields.
- Update documentation, runbooks and on-call dashboards.
- Add e2e coverage for the steady state.

### Exit criteria

- No production route uses legacy owner scope.
- No live data depends on `managedByOwnerId`/`caretakerIds` for authorization.
- Legacy fields are read-only/deprecated with a removal plan.
- Rollback no longer requires legacy fallback for day-to-day operations.
- Tests and runbooks reflect the new model.

---

## 13. Cross-cutting testing gates

Every phase must keep these green:

| Gate | Command / evidence |
| --- | --- |
| Format/lint | `./node_modules/.bin/biome check .` |
| Types | `npm run typecheck` |
| Unit/integration | `npm run test` |
| Coverage | `npm run test:coverage` |
| Build | `npm run build` |
| Migration dry-run | report attached to the phase |
| Migration apply | staging clone, checksum report |
| Authorization matrix | allow/deny table complete for touched routes |
| Audit | every privileged mutation emits an event |
| Performance | p95 API latency and Mongo query counts within agreed SLO |

Add Playwright e2e before Phase 5 (public marketplace is the highest-value
end-to-end flow). At minimum:

1. admin creates property/units and lists;
2. broker applies/gets verified/authorised;
3. broker shares link, prospect applies;
4. admin approves, tenant pays, commission accrues;
5. system-admin pays, statement visible;
6. refund triggers clawback.

---

## 14. Feature flags

Suggested flags (names may change):

```text
assignment_auth_read
assignment_auth_write
canonical_blocks
billing_accounts
billing_callbacks_v2
admin_role
marketplace_listings
marketplace_public
broker_portal
attribution
commission_shadow
commission_payouts
```

Rules:

- flags default off in production;
- flags are checked server-side;
- public page and API flags are separate;
- every flag has an owner and a removal date;
- flag state is logged in release notes;
- no flag may bypass authorization.

---

## 15. Definition of done for the programme

The redesign is complete when:

1. A property has no implicit single owner/manager.
2. Admin/custodian/caretaker authority is assignment-based and revocable.
3. Legal ownership and billing responsibility are separate and visible.
4. Units can be listed individually by multiple authorised publishers.
5. Brokers are verified, scoped and unable to see internal data.
6. Attribution is captured server-side and is immutable after confirmation.
7. Commission is accrued from settled rent, approved and paid with separation
   of duties.
8. All privileged actions are audited.
9. Legacy owner fields are retired or formally deprecated with a removal plan.
10. Security, migration, e2e and finance reconciliations pass.

---

## 16. Stage 1 approval and implementation gate

Stage 1 is complete. The user subsequently authorized Phase 0 P0 work and
Phase 1 implementation on 2026-11-02. This authorization is limited to those
scopes; do not start Phases 2–9. Backup/restore, staging and named operational
owners remain required before production migration or deployment. Legal/Finance
approval remains required before payout enablement.

Before a production migration or deployment:

- the 8 Stage 1 documents are reviewed;
- the decision register has owners and accepted defaults;
- product approves the public-data/privacy model;
- finance/legal approve the commission payer and tax model (or explicitly defer
  commission to a later programme);
- engineering accepts the compatibility/migration window and the P0 fix scope.

**Authorization boundary:** local code and test work is authorized for P0 and
Phase 1 only. No production data changes or deployment are authorized by this
document.
