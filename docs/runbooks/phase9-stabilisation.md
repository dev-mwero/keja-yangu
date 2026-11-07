# Phase 9 Stabilisation Runbook

Read-only daily operations for the assignment/billing/legacy retirement soak. No
step in this runbook mutates production data.

## Daily order

Run against the production replica (or a read-only connection):

```bash
npm run audit:phase9
npm run reconcile:attributions
npm run reconcile:commissions
npm run backfill:commissions   # dry-run; no --apply in the soak
```

Expected steady state:

- `phase9-readiness` exits `0`.
- `reconcile-attributions` reports `ok`.
- `reconcile-commissions` reports `ok` and zero duplicates.
- `backfill-commissions` shows the same projected totals as finance reports.

Keep the four outputs for the release-cycle evidence pack.

## What each signal means

### Legacy readiness

- `activeOwnerRoleUsers` — cannot remove owner aliases while non-zero.
- `propertiesWithLegacyOwner/Caretakers/Custodians` — legacy property references
  still present; readers must keep working until zero.
- `usersWithLegacyManager` — caretakers still linked through `managedByOwnerId`.
- `ownersWithoutAssignment` — a legacy owner field points at a principal with no
  active admin assignment. Escalate to the property admin team to grant or
  correct the assignment.
- `orphanAssignments` — active assignment points at a missing/deleted property.
  Revoke or re-scope after confirming history.
- `missingBlockAssignments` / `missingUnitAssignments` — scope references drifted.
  Verify the block/unit was not deleted; re-create or revoke.
- `unitBillingDrift` — a unit points at a missing, deleted or non-active billing
  account. Fix the pointer with the billing owner before billing runs.

### Attribution reconciliation

- Orphan confirmed attributions or duplicate lease attributions block payouts and
  legacy retirement. Resolve before retrying.

### Commission reconciliation

- `paidWithoutBatch` / `paidButBatchNotPaid` must be zero.
- Duplicate accruals per invoice must be zero. Never delete rows; append a
  reversal or correction.

### Scoped authorization rollout (shadow → enforce)

1. **Shadow first:** set `AUTHZ_SHADOW_SAMPLE_RATE=1.0` and collect at least
   one full release cycle of `authz.shadow.mismatch` / `authz.enforce.mismatch`
   audit events. Gate: zero **unexplained** mismatches (or documented,
   accepted intended-tightening cases) before enforcing anything. Observational
   only — no behavior change.
2. **Enforce per family, one at a time**, with a soak between each:
   `chat` → `units` → (`invoices`, `tenants`) → `properties` **last**
   (properties carries the caretaker capability-gating risk and is
   foundational to the others' resource resolution).
3. **Precondition:** caretaker `property:create` / `property:delete` remain
   privilege-gated (`create_property` / `delete_assigned_property`) with no
   scoped-policy override — the scoped policy handles scoping only. Do not
   assume privileges map to assignments; the backfill cannot represent them.
4. **Rollback is env-only:** clear a family from
   `AUTHZ_ENFORCE_ROUTE_FAMILIES` or set the sample rate back to `0`. The
   legacy fallback stays until backfill coverage is 100% and a full clean
   cycle has passed. `*` is staging-only.

## Escalation

| Signal | Owner | Action |
| --- | --- | --- |
| Readiness drift | Platform admin on-call | Open an incident, fix data, re-run daily audit |
| Attribution dispute | Broker operations | Freeze affected payout batch, investigate evidence |
| Commission mismatch | Finance | Keep `COMMISSION_PAYOUTS_ENABLED=false`, reconcile ledgers |
| Billing pointer drift | Billing admin | Correct unit/billing assignment, re-run audit |

Any unexplained drift pauses legacy removal for the next cycle.

## Rollback

1. Disable payout execution first:

   ```text
   COMMISSION_PAYOUTS_ENABLED=false
   ```

2. Preserve all ledgers, assignments, audit rows and payout batches. Never delete.
3. Redeploy the previous application version if authorization scoping regresses.
4. Re-enable any fallback flag introduced by the retirement change.
5. Re-run readiness, attribution and commission reconciliations before retrying.

## Retirement gate

Do not remove legacy fallbacks until:

- Four consecutive weeks (or one full release cycle, whichever is longer) of
  green audits.
- Finance/legal sign-off for commission.
- Product/SEO decision recorded for legacy public pages.
- A tested rollback that does not depend on the legacy fallback for day-to-day
  operations.

## Change checklist for the retirement PR

- [ ] Stop writing `Property.ownerId`, `caretakerIds`, `custodianIds`.
- [ ] Stop writing `User.managedByOwnerId`.
- [ ] Remove `owner` aliases from `src/lib/permissions.ts` and
      `src/lib/authorization.ts`.
- [ ] Retire/redirect legacy public pages.
- [ ] Update tests to use assignment-only fixtures.
- [ ] Add steady-state Playwright coverage.
- [ ] Run `npm run check`, `npm run typecheck`, `npm run test`, `npm run build`.
