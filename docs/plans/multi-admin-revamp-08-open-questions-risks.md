# Stage 1 — Open Questions, Decisions and Risks

**Status:** Stage 1 complete; P0 and Phase 1 implementation authorized 2026-11-02
**Date:** 2026-11-01; decision reconciliation: 2026-11-02
**Purpose:** Put every unresolved business, legal and operational question in
one place, with recommended defaults and the phase that is blocked by it.

> `multi-admin-revamp-09-approval.md` records the approved design and subsequent
> authorization for P0 and Phase 1 implementation. Later phases and production
> migration/deployment remain gated; legal/financial gates remain for payouts.

---

## 1. Decision register

Legend:

- **Blocking** — cannot start the named phase without a decision.
- **Defaultable** — engineering can proceed on the recommended default, but it
  must be confirmed before the phase exit.
- **Deferred** — can ship later without changing the first release.

| ID | Decision | Recommended default | Type | Blocks |
| --- | --- | --- | --- | --- |
| D-01 | Public listing address detail | Show county/estate/approximate location; hide exact plot/door until inquiry is accepted | Blocking | Phase 5 |
| D-02 | Attribution model | Last valid publisher touch within 30 days; application locks attribution | Blocking | Phase 7 |
| D-03 | Provisional attribution lifetime | 90 days, configurable | Defaultable | Phase 7 |
| D-04 | Commission basis and cap | Agreement-specific fixed and/or percentage terms; first-month default and any cap need Product clarification | Blocking | Phase 8 |
| D-05 | Commission payer / fund flow | Billing account pays broker directly; platform records only | Blocking | Phase 8 |
| D-06 | Commission tax/withholding | Configurable `taxBps`, applied to gross; legal/Finance confirm rate and remittance | Blocking | Phase 8 |
| D-07 | Commission on renewals | No; only the first tenancy from a confirmed attribution | Defaultable | Phase 8 |
| D-08 | Eligibility/clawback windows | Eligible 7 days after settled rent; clawback on refund within 30 days | Defaultable | Phase 8 |
| D-09 | Broker exclusivity | Off by default; no exclusive agreements in the first release | Defaultable | Phase 6 |
| D-10 | Who authorises brokers | Any admin with `broker:authorize` on the unit scope | Defaultable | Phase 6 |
| D-11 | Co-admin consent for broker/commission | No extra consent; each admin acts independently within scope, audited | Defaultable | Phase 6 |
| D-12 | Who sets listing rent | Admin with `listing:publish`; brokers cannot change terms | Defaultable | Phase 5 |
| D-13 | Duplicate property policy | Soft dedupe + claim + system-admin merge; no hard unique address in release 1 | Defaultable | Phase 2 |
| D-14 | Property creation by caretaker/custodian | Admin-only in release 1; revisit portfolio-level create permission later | Defaultable | Phase 2 |
| D-15 | `reserved` `Unit.status` value | Do not add it in release 1; represent holds as separate reservation records | Resolved | Phase 5 |
| D-16 | True multi-unit tenant | Keep one active lease per tenant in release 1 | Deferred | — |
| D-17 | Legal owner dashboard access | No access by ownership alone; must hold an assignment | Blocking | Phase 1 |
| D-18 | Broker licensing | Require identity/business verification; licence requirement subject to legal review | Blocking | Phase 6 |
| D-19 | Broker tenant-data visibility | No tenant contact/internal data before application consent or confirmed tenancy | Blocking | Phase 6 |
| D-20 | Payout frequency/threshold | Monthly cycle, configurable minimum; Finance sets amount | Defaultable | Phase 8 |
| D-21 | Audit retention | At least 2 years, subject to legal/regulatory review | Defaultable | Phase 1 |
| D-22 | Legacy public pages | Keep during compatibility; redirect after SEO/product sign-off | Deferred | Phase 9 |
| D-23 | Platform finance role | Use system-admin for payouts initially; consider a finance role later | Deferred | Phase 8 |
| D-24 | Ownership verification | Manual evidence review by system-admin initially | Defaultable | Phase 2 |
| D-25 | Listing terms across publishers | One canonical listing/terms; each publisher gets a share code | Defaultable | Phase 5 |
| D-26 | Commission for existing tenants | No commission unless a new tenancy is attributed and confirmed | Defaultable | Phase 7 |
| D-27 | Commission on admin/platform-sourced tenants | None; broker commission only | Defaultable | Phase 8 |
| D-28 | Who bears commission tax | Withheld from gross broker commission; legal confirms | Blocking | Phase 8 |
| D-29 | Manual property-level invoices | Keep supported for adjustments; no unit required | Defaultable | Phase 3 |
| D-30 | Invoice number format | `${prefix}-${YYYYMM}-${seq}`; preserve historical numbers | Defaultable | Phase 3 |
| D-31 | Direct vs broker conflict after lock | No overwrite; system-admin dispute only | Defaultable | Phase 7 |
| D-32 | Broker data retention | Keep attribution/commission records per finance/legal policy | Deferred | Phase 8 |

### 1.1 Decision reconciliation to approval 09

The following are approved design decisions; their implementation is not
authorized by this register alone:

| Original decision | Approved direction |
| --- | --- |
| D-01 | Approximate county/estate/area only; hide exact plot, door and unit identifiers until the inquiry/approval process permits disclosure (M-09). |
| D-02 | Last valid publisher touch in 30 days; lock when the application is submitted (B-04). |
| D-03 | 90-day configurable provisional attribution (B-05). |
| D-05 | Billing account pays directly; platform records/reconciles but does not hold or route funds. Legal/Finance confirmation is still required before payouts (B-12). |
| D-09–D-12 | Non-exclusive by default; scoped admins may act independently; admin controls canonical listing terms (M-06–M-08). |
| D-13 | Soft duplicate detection and claims/disputes; system-admin handles review/merge (P-03/P-08). |
| D-14 | Property creation is admin-only in release 1 (P-06). |
| D-17 | Legal ownership alone grants no dashboard access; an explicit admin assignment is required (P-07). |
| D-18 | Identity/business verification is required; statutory licence requirement remains for Legal to determine (B-02). |
| D-19 | No tenant contact/internal data before consent or confirmed tenancy (B-03). |
| D-25 | One canonical listing and canonical terms; publisher-specific share/attribution records (M-03/M-04). |
| D-26/D-27 | No commission for existing or direct/platform-sourced tenants without valid new broker attribution (B-07/B-08). |
| D-31 | Locked attribution is not overwritten; disputes go to system-admin with an immutable trail (B-09). |

**Clarification still needed:** D-04's first-month-rent default and 100% cap are
not explicitly ratified by approval 09, which instead permits fixed and/or
percentage terms per agreement (B-11). Do not implement a global basis or cap
until Product confirms the intended rule. Tax rate/incidence, payer workflow,
eligibility/clawback values, payout cycle/threshold, statutory licensing and
retention also retain the external approvals identified in approval 09 §4.6.

---

## 2. Questions that must be answered before Stage 2

### 2.1 Is commission part of the first release?

**Why it matters:** commission adds legal/financial obligations, a payout
process and dispute handling. It can be deferred while listings and broker
attribution ship first.

Options:

1. **All in one programme** — listings, brokers, attribution, commission.
2. **Phase 1 listings + Phase 2 brokers/commission** — recommended if Finance/
   Legal are not ready.
3. **Listings only** — no broker role yet.

Approved: ship listings and broker attribution before real settlement;
commission may run in shadow mode. Do not enable payouts before Legal/Finance
sign-off (approval 09 B-17).

### 2.2 Who pays the broker and does money pass through the platform?

Approved design direction: the billing account pays the broker directly and the
platform records/reconciles without holding or routing funds (approval 09
B-12). Legal/Finance must confirm the workflow and obligations before payout
code is enabled; platform clearing is outside first release.

### 2.3 What is the attribution rule?

Approved: last valid publisher touch within 30 days wins; lock attribution when
the application is submitted (approval 09 B-04). Provisional attribution lasts
90 configurable days (B-05).

### 2.4 How much public location data is shown?

Approved: show county/estate/approximate area and suitable unit information;
hide exact plot, door and unit identifiers until the inquiry/approval process
permits disclosure (approval 09 M-09).

### 2.5 Are brokers exclusive?

Approved: non-exclusive by default; no exclusive mandates in the first release
(approval 09 M-06).

### 2.6 Is a broker licence mandatory?

This is a legal/product question. At minimum verify identity and business
details. If a licence is mandatory, unlicensed brokers remain `pending` and
cannot publish. Do not invent the requirement without legal input.

### 2.7 Can co-admins act independently?

Approved: admins may act independently within their granted scope; no additional
co-admin consent is required by default, and the acting admin/scope is audited
(approval 09 M-07).

### 2.8 Do legal owners get dashboard access automatically?

Approved: legal ownership alone grants no dashboard access. A legal owner who
manages must hold an explicit admin assignment (approval 09 P-07).

### 2.9 Can caretakers/custodians create properties?

Approved: property creation is admin-only in the first release. Reconsider
staff creation later only through an explicit portfolio-level permission
(approval 09 P-06).

### 2.10 What happens to existing owner accounts and communications?

Approved: migrate existing `owner` accounts to `admin` through a staged
compatibility process, preserve their portfolio by explicit assignments, and
retain legal-owner wording where appropriate (approval 09 P-09).

---

## 3. Risk register

Severity reflects impact if unmitigated; likelihood reflects the current
baseline.

| ID | Risk | Severity | Likelihood | Mitigation |
| --- | --- | --- | --- | --- |
| R-01 | P0 fixes are present in code but deployment/release verification is not recorded | High | Medium | Re-run regression checks and verify release state in Phase 0 |
| R-02 | Blind `owner → admin` rename breaks 341 role literals and 985 `ownerId` references in `src/` | High | High | Role alias, staged cutover, codemod only with allow-list, full test matrix |
| R-03 | Owner migration misses users/properties and locks admins out | High | Medium | Baseline report, assignment coverage checks, legacy fallback |
| R-04 | Block mirror drifts from embedded blocks | High | Medium | Dual-write by id, reconciliation job, cutover only after zero drift |
| R-05 | Invoice/payment history is altered or duplicated | Critical | Medium | Immutable checksums, no amount rewrites, idempotent migration, backup |
| R-06 | Invoice prefix change breaks numbering or collides | High | Medium | Dry-run per period, unique index/retry, preserve historical numbers |
| R-07 | Payment callback migration breaks in-flight payments | Critical | Medium | Deploy new route first, legacy adapter, in-flight staging tests |
| R-08 | New authorization has a bypass or over-grants | Critical | Medium | Central policy, resource loaders, allow/deny matrix, shadow mode, P0 tests |
| R-09 | Public marketplace leaks occupied units or tenant data | High | High | Shared public serialiser, no `includeUnits=all`, projection tests |
| R-10 | Broker sees tenant/PII before consent | High | Medium | Field-level redaction, authorization tests, privacy review |
| R-11 | Attribution is gamed or overwritten | High | Medium | Server-validated share codes, immutable after lock, dispute trail |
| R-12 | Commission is miscalculated or paid twice | Critical | Medium | Integer math, agreement snapshot, unique accrual keys, shadow mode, reconciliation |
| R-13 | Refund/clawback creates a negative balance with no recovery path | High | Medium | Clawback netting, receivable state, Finance approval |
| R-14 | Commission/fund flow triggers licensing or tax issues | Critical | Medium | Legal/Finance review before payouts; payer decision |
| R-15 | No transactions causes partial writes during migration | High | Medium | Idempotent upserts, checkpoints, compensation, verification, no destructive steps |
| R-16 | Permission resolution adds latency | Medium | Medium | Indexed assignments, per-request query budget, optional versioned cache |
| R-17 | Index build fails on duplicate data | High | Medium | Preflight duplicate reports; build unique indexes last |
| R-18 | Dual-write/dual-read creates two sources of truth | High | High | Explicit source-of-truth table, reconciliation, phased retirement |
| R-19 | Duplicate properties proliferate during self-registration | High | High | Identity fields, dedupe signal, claim/merge flow |
| R-20 | Co-admin conflicts (rent, broker, commission) | Medium | High | Scope/permission model, audit, decision D-11 |
| R-21 | Scope creep delays the security fixes | High | High | Phase 0 as a separate release; strict gate |
| R-22 | No e2e suite leaves multi-role regressions undetected | High | High | Add Playwright before Phase 5; critical-path tests |
| R-23 | Legacy public pages and new listings show conflicting availability | Medium | High | Feature flag, cache purge, explicit legacy fallback, comparison report |
| R-24 | Admin notifications route to wrong people | Medium | Medium | Assignment-derived recipients, tests per role |
| R-25 | Audit log is incomplete or contains secrets | High | Medium | Central audit helper, redaction tests, review |
| R-26 | Finance/legal delays block engineering | High | Medium | Decouple listings/brokers from payouts; shadow commission |
| R-27 | Operator error during migration | High | Medium | Dry-run, runbook, two-person apply, backup/restore drill |
| R-28 | Legacy owner fields are removed too early | High | Low | Explicit deprecation gate; no removal before one full cycle |

---

## 4. Assumptions

These are not decisions; they are working assumptions that must be confirmed.

1. Existing `owner` accounts are legitimate admins and should keep their
   current portfolio.
2. Every live unit has a property owner and a matching embedded block, or the
   exception can be reviewed before migration.
3. Embedded block/floor `_id`s can be reused as the new `Block`/floor ids,
   preserving `Unit.blockId`/`floorId`.
4. The deployment supports background index builds and a maintenance window for
   preflight.
5. MongoDB transactions remain optional; idempotency is the primary safety
   mechanism.
6. KES is the only currency in the first release.
7. One active lease per tenant remains acceptable for the first release.
8. No historical commission is owed for tenancies created before the
   commission feature is enabled.
9. Existing payment provider contracts allow the billing-account callback
   design, or the legacy adapter remains indefinitely.
10. Product can accept a compatibility window with both legacy and new public
    pages.
11. Legal/Finance will provide the commission payer, tax and licensing rules
    before payouts are enabled.
12. The team can add e2e tests and fix the current lint baseline before Phase 0
    exits.

---

## 5. Stage 2 entry checklist

Before any implementation work starts:

- [x] All 8 Stage 1 documents reviewed and approved; audit reconciled to approval 09.
- [x] P0 problem statement and release/fix scope explicitly accepted for Phase 0.
- [x] Decision D-01 (public data) approved in approval 09 (M-09).
- [x] Decision D-02 (attribution) approved in approval 09 (B-04).
- [x] Decision D-05 (direct billing-account payer) approved as design direction (B-12); external Legal/Finance confirmation remains before payout enablement.
- [x] Decisions D-17 and D-19 approved in approval 09; D-18 identity/business verification approved, statutory licence requirement pending Legal.
- [ ] Legal/Finance sign-off recorded for commission, or commission removed
      from the first programme.
- [ ] Backup/restore and staging clone verified.
- [ ] Migration runbook owner and rollback owner named.
- [ ] Feature-flag ownership and removal dates agreed.
- [ ] Phase 0 security fixes scheduled as a separate release.
- [ ] Engineering accepts the scope and sequencing in
      `multi-admin-revamp-07-phased-implementation.md`.

P0 and Phase 1 local implementation are authorized. The remaining checklist
items are required before production migration/deployment or payout enablement;
they do not block local code and test work in the authorized scope.
