# Phase 8 — Commission

**Status:** Plan Approved — Implementation In Progress  
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

- [ ] Shadow accruals reconcile to expected amounts for a synthetic full cycle.
- [ ] Duplicate settlement replays do not duplicate accruals.
- [ ] Refund/cancellation produces a reversal or clawback.
- [ ] Broker/admin/system-admin permissions are enforced.
- [ ] Payout failure restores accruals to `approved`.
- [ ] Finance/legal sign-off recorded before enabling live payouts.
- [ ] `tsc --noEmit`, Biome, Vitest and `npm run build` pass.

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

## 11. Open Decisions (must be resolved before live payout)

- D-04: `first_month_rent` default rate/cap.
- Payer confirmation (approved direction: billing account pays broker directly).
- Tax handling and withholding basis.
- Minimum payout threshold and monthly cut-off.
- Clawback window and escalation limits.
