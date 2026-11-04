# Phase 8 — Commission

**Status:** Implementation complete — awaiting finance/legal sign-off (shadow mode)  
**Goal:** accrue commission from collected rent, run in shadow mode, and only then
enable controlled payouts with segregation of duties and clawbacks.  
**Depends on:** Phase 7 complete (`feat/revamp`, attribution + confirmed lease linkage)

> [!IMPORTANT]
> Authorization boundary: local code, test fixtures and scripts only. No live
> production database mutations, no real payouts, and no deployment.

---

## 1. Objectives & Exit Criteria

### 1.1 Objectives

1. **Commission ledger models**
   - `CommissionAccrual` with immutable agreement snapshots, integer minor units,
     lifecycle states (`pending → eligible → approved → paid`, plus `reversed`
     and `disputed`).
   - `CommissionPayout` batches that freeze accrual ids and record execution
     evidence.
2. **Single commission calculator**
   - One half-up rounding helper used for every amount.
   - Support `first_month_rent`, `percentage_of_rent` and `fixed` bases.
   - Accrue from collected **rent only**; exclude service charge, deposits,
     utilities, penalties and taxes.
3. **Settlement integration (shadow mode)**
   - Create accruals when an invoice settles via webhook/verify or staff mark-paid.
   - Idempotent on `{ attributionId, invoiceId, kind }` so provider replays and
     concurrent settlement paths cannot double-accrue.
   - Compute and record accruals but pay nothing while shadow mode is on.
4. **Eligibility and approval**
   - `eligibilityAt` defaults to settlement + configurable delay (default 7 days).
   - Admin may approve eligible accruals; brokers may never approve or pay.
5. **Payout execution**
   - System-admin creates a payout batch from approved accruals and executes it
     only when `COMMISSION_PAYOUTS_ENABLED=true`.
   - Failed execution returns accruals to `approved`; paid batches are immutable.
6. **Reversals and clawbacks**
   - Refund/cancellation before payment reverses the accrual.
   - After payment, create a negative `clawback` accrual for the next payout.
   - Never edit or delete the original accrual; always append.
7. **Reconciliation and visibility**
   - Broker sees own gross, tax, net and references only.
   - Admin/system-admin see portfolio-wide accruals and payout batches.
   - Reconciliation report flags paid accruals without a paid batch and duplicate
     accruals per invoice.

### 1.2 Exit Criteria

- [x] Shadow accruals reconcile to expected amounts for a synthetic full cycle.
- [x] Duplicate settlement replays do not duplicate accruals.
- [x] Refund/cancellation produces a reversal or clawback.
- [x] Broker/admin/system-admin permissions are enforced.
- [x] Payout failure restores accruals to `approved`.
- [ ] Finance/legal sign-off recorded before enabling live payouts.
- [x] `tsc --noEmit`, Biome, Vitest and `npm run build` pass.

---

## 2. Domain Enums (`src/lib/domain-enums.ts`)

```ts
COMMISSION_ACCRUAL_KINDS = ["initial", "recurring", "adjustment", "clawback"]
COMMISSION_ACCRUAL_STATUSES = [
  "pending", "eligible", "approved", "paid", "reversed", "disputed",
]
COMMISSION_PAYOUT_STATUSES = [
  "draft", "approved", "processing", "paid", "failed", "void",
]
```

---

## 3. Models

### 3.1 `CommissionAccrual`

Key fields:

```ts
attributionId, agreementId, brokerUserId, propertyId, unitId, leaseId,
invoiceId, paymentId?, kind, basis, basisMinor, rateBps, fixedAmountMinor,
grossMinor, taxBps, taxMinor, netMinor, currency,
status, eligibilityAt, approvedByUserId?, approvedAt?, paidAt?, payoutId?,
reversedAt?, reversalReason?, metadata?, timestamps
```

Indexes:
- Unique `{ attributionId, invoiceId, kind }` — the replay mutex.
- `{ brokerUserId, status, eligibilityAt }`
- `{ status, eligibilityAt }`
- `{ payoutId }`
- `{ leaseId, kind }`

### 3.2 `CommissionPayout`

```ts
batchCode, brokerUserId, accrualIds, grossMinor, taxMinor, netMinor,
currency, status, cutoffAt, createdByUserId, approvedByUserId?,
executedByUserId?, providerReference?, failureReason?, paidAt?, timestamps
```

Indexes:
- Unique `{ batchCode }`
- `{ brokerUserId, status }`
- `{ status, createdAt }`

---

## 4. Calculator (`src/lib/commission.ts`)

```text
basisMinor =
  first_month_rent:   min(collectedRentMinor, oneMonthRentMinor)
  percentage_of_rent: collectedRentMinor
  fixed:              0

grossMinor =
  first_month_rent:   roundHalfUp(basisMinor * rateBps / 10000)
  percentage_of_rent: roundHalfUp(basisMinor * rateBps / 10000)
  fixed:              fixedAmountMinor

taxMinor = roundHalfUp(grossMinor * taxBps / 10000)
netMinor = grossMinor - taxMinor
```

Rules:
- Negative/zero basis creates no positive accrual.
- `first_month_rent` yields at most one `initial` accrual per attribution.
- Every other settled rent invoice yields one `recurring` accrual.
- Snapshot the agreement terms used; later agreement edits never rewrite history.

---

## 5. Service Layer (`src/lib/commission.ts`)

1. `computeCommission(input)` — pure calculator.
2. `accrueCommissionForSettledInvoice(invoice)` — resolves the confirmed
   attribution + agreement, builds the snapshot, inserts idempotently, and emits
   `commission.accrued`. Non-fatal to settlement.
3. `markEligibleAccruals(now)` — pending accruals past `eligibilityAt` become
   eligible.
4. `approveAccrual(actor, accrualId)` — admin/system-admin only; records actor.
5. `createPayoutBatch(actor, brokerUserId, accrualIds?)` — system-admin only;
   freezes approved accruals and records totals.
6. `executePayout(actor, payoutId, providerReference?)` — system-admin only,
   blocked unless payouts are enabled; marks batch + accruals paid.
7. `failPayout(actor, payoutId, reason)` — restores accruals to `approved`.
8. `createClawback(actor, accrualId, reason)` — reverses unpaid accruals or
   appends a negative clawback for paid ones.
9. `reconcileCommissions()` — reports orphans, duplicates and paid/unpaid drift.

---

## 6. Integration Hooks

1. `src/lib/payments/settle.ts` — after a successful settlement, best-effort call
   `accrueCommissionForSettledInvoice(updated)`.
2. `src/app/api/v1/invoices/[id]/mark-paid/route.ts` — same best-effort call for
   offline settlements.
3. `scripts/backfill-commissions.ts` — dry-run/report tool for historical paid
   invoices (shadow-only; no payouts).

---

## 7. API Routes

Admin/system-admin:

```text
GET  /api/v1/commissions                     list accruals (scoped)
POST /api/v1/commissions/[id]/approve        approve an eligible accrual
POST /api/v1/commissions/[id]/clawback       reverse or append clawback
GET  /api/v1/admin/commission-payouts        list payout batches
POST /api/v1/admin/commission-payouts        create a batch (system-admin)
POST /api/v1/admin/commission-payouts/[id]/pay   execute (system-admin, gated)
POST /api/v1/admin/commission-payouts/[id]/fail  restore accruals to approved
```

Broker:

```text
GET /api/v1/brokers/commissions              own accruals only
```

All routes use `{ data, pagination? }` / `{ error }` conventions and audit every
privileged mutation.

---

## 8. Authorization Matrix

| Action | Broker | Admin | System-admin |
| --- | --- | --- | --- |
| Read own accruals | yes | yes (portfolio) | yes (all) |
| Read all accruals | no | scoped | yes |
| Approve accrual | no | yes | yes |
| Create payout batch | no | no | yes |
| Execute payout | no | no | yes (flag-gated) |
| Fail/void payout | no | no | yes |
| Clawback | no | no | yes |

---

## 9. Shadow Mode & Rollout

1. Deploy models, calculator and settlement hook with accrual creation on.
2. Run `scripts/backfill-commissions.ts --dry-run` and compare to finance reports.
3. Keep `COMMISSION_PAYOUTS_ENABLED=false`; payout execution returns `409`.
4. After finance/legal sign-off, enable payouts per environment.
5. Turn off payout execution first on rollback; preserve accrual history and mark
   runs void, never delete.

---

## 10. Testing Gates

- Pure math: all bases, rounding edges, zero/negative basis, tax.
- Idempotency: duplicate settlement/replay creates one accrual.
- Lifecycle: pending → eligible → approved → paid; failure restores approved.
- Reversal: unpaid → reversed; paid → negative clawback.
- Authorization: broker cannot approve/pay; admin cannot execute payout.
- Reconciliation: orphan/duplicate detection.
- Full `tsc --noEmit`, Biome, Vitest and `npm run build`.

---

## 11. Launch Decisions

Resolved 2026-11-04 with product direction:

- **D-04:** `first_month_rent` = 100% of one month (`rateBps: 10000`), uncapped,
  overridable per agreement.
- **Payer:** billing account pays the broker directly.
- **Tax:** withhold from `agreement.taxBps`; default `0` until legal confirms the
  withholding basis. Snapshot the applied rate on every accrual.
- **Minimum payout:** `COMMISSION_MIN_PAYOUT_MINOR`, default `0` at launch.
- **Cut-off:** manual batching at launch; automated monthly cut-off later.
- **Clawback window:** `COMMISSION_CLAWBACK_WINDOW_DAYS`, default `30` days from
  `paidAt`; later reversals require a manual adjustment.

Configuration knobs:

```text
COMMISSION_PAYOUTS_ENABLED=false        # live execution gate
COMMISSION_ELIGIBILITY_DELAY_DAYS=7     # settlement -> eligible
COMMISSION_MIN_PAYOUT_MINOR=0           # batch floor
COMMISSION_CLAWBACK_WINDOW_DAYS=30      # paid clawback window
```

Finance/legal sign-off is still required before enabling live payouts.

---

## 12. Implementation Notes (2026-11-04)

Implemented locally; no live database mutation, payout or deployment was performed.

### Added

- `src/models/CommissionAccrual.ts` — ledger with agreement snapshot, unique
  replay mutex on `{ attributionId, invoiceId, kind }`, eligibility and payout indexes.
- `src/models/CommissionPayout.ts` — frozen accrual batches with execution evidence.
- `src/lib/commission.ts` — calculator, shadow accrual, eligibility, approval,
  payout create/execute/fail, clawback, duplication/consistency reconciliation.
- `src/lib/domain-enums.ts` — commission accrual kinds/statuses and payout statuses.
- API routes:
  - `GET /api/v1/commissions`
  - `POST /api/v1/commissions/[id]/approve`
  - `POST /api/v1/commissions/[id]/clawback`
  - `GET|POST /api/v1/admin/commission-payouts`
  - `POST /api/v1/admin/commission-payouts/[id]/pay`
  - `POST /api/v1/admin/commission-payouts/[id]/fail`
  - `GET /api/v1/brokers/commissions`
- Settlement hooks (best-effort, non-fatal) in `src/lib/payments/settle.ts`,
  staff mark-paid and tenant mark-paid routes.
- `scripts/backfill-commissions.ts` — dry-run by default; `--apply` creates
  shadow accruals only.
- `scripts/reconcile-commissions.ts` — flags paid-without-batch, unpaid batch and
  duplicate accruals.
- Broker dashboard commissions tab and `/dashboard/system-admin/commissions`
  management page/nav.
- Tests for calculator, lifecycle, idempotency, reconciliation, models and routes.

### Verification

- `npx tsc --noEmit` — clean.
- `npx biome check --write .` — no errors (existing warnings remain).
- `npm run test` — 220 files / 1959 tests passed.
- `npm run build` — succeeded; `/dashboard/system-admin/commissions` in route table.

### Follow-up completed (same day)

- Accruals now use `agreement.taxBps` (was hardcoded to `0`) and snapshot it.
- Eligibility delay, minimum payout and clawback window are env-configurable and
  enforced; paid clawbacks outside the window are rejected.
- Backfill dry-run now prints projected gross/tax/net totals for finance.
- Admin-role commissions page added; broker nav deep-links to the commissions tab.

### Still open before live payout

- Finance/legal sign-off.
- Keep `COMMISSION_PAYOUTS_ENABLED=false` until sign-off; execution returns `409`.
