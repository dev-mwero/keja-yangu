# Phase 9 — Stabilisation and Legacy Retirement

**Status:** Local audit foundation implemented — production soak pending  
**Goal:** prove the new assignment/billing model has zero unexplained drift, then
retire legacy owner-scoped paths without breaking day-to-day operations.  
**Depends on:** Phases 1–8 complete on `feat/revamp`.

> [!IMPORTANT]
> Authorization boundary: local code, tests and read-only audit scripts only. No
> production data mutations, no deployment and no destructive cleanup.

---

## 1. Objectives

1. **Continuous reconciliation**
   - Daily read-only audit of management assignments, billing pointers and
     block/unit scope references.
   - Attribution and commission reconciliations remain part of the same runbook.
   - Any drift blocks legacy removal until explained and corrected.
2. **Legacy readiness audit**
   - Count remaining legacy owner fields (`Property.ownerId`,
     `Property.caretakerIds`, `Property.custodianIds`, `User.managedByOwnerId`).
   - Count active `owner`-role users.
   - Detect properties whose legacy owner has no active admin assignment.
   - Detect orphan block/unit assignments and stale unit billing pointers.
3. **Safe legacy retirement**
   - Remove legacy authorization fallbacks only after a full release cycle with
     zero unexplained drift.
   - Stop writing legacy owner fields once all readers use assignments.
   - Remove `owner` role aliases last, behind a separate change.
4. **Public surface cleanup**
   - Retire/redirect legacy public pages only after product/SEO sign-off.
5. **Operational readiness**
   - Runbook covers daily audit, drift escalation, rollback and ownership.
   - E2E steady-state coverage for login → property scope → billing → broker →
     attribution → commission.

---

## 2. Workstreams

### 2.1 Read-only readiness audit (local, implementable now)

`src/lib/legacy-readiness.ts` exposes:

- `buildLegacyReadinessReport(input)` — pure report builder.
- `auditLegacyReadiness()` — loads current state and returns the report.

Report fields:

```ts
interface LegacyReadinessReport {
  generatedAt: string;
  counts: {
    activeOwnerRoleUsers: number;
    propertiesWithLegacyOwner: number;
    propertiesWithLegacyCaretakers: number;
    propertiesWithLegacyCustodians: number;
    usersWithLegacyManager: number;
    activeAssignments: number;
  };
  blocking: {
    ownerRoleUsers: string[];
    ownersWithoutAssignment: Array<{ propertyId: string; ownerId: string }>;
    orphanAssignments: Array<{ assignmentId: string; propertyId: string }>;
    missingBlockAssignments: Array<{ assignmentId: string; blockId: string }>;
    missingUnitAssignments: Array<{ assignmentId: string; unitId: string }>;
    unitBillingDrift: Array<{ unitId: string; billingAccountId: string }>;
  };
  readyForLegacyRetirement: boolean;
}
```

`readyForLegacyRetirement` is true only when every blocking list is empty and the
two legacy reference counters (properties with legacy owners/caretakers/custodians
and users with legacy managers) are zero.

`scripts/phase9-readiness.ts` prints the report and exits non-zero on drift.
It never writes.

### 2.2 Daily reconciliation runbook (implementable now)

`docs/runbooks/phase9-stabilisation.md` documents:

- Daily order: legacy readiness → assignments → billing → blocks →
  attributions → commissions.
- Who owns each signal and the escalation path.
- Rollback: disable payout execution first, preserve ledgers, never delete.
- One-release-cycle soak requirement before removing fallbacks.

### 2.3 Legacy fallback removal (gated on production evidence)

Not implementable locally without production data. Requires:

- Zero drift for at least one release cycle.
- Product/SEO decision on legacy public page redirects.
- Separate change to remove `owner` aliases from `permissions.ts` and
  `authorization.ts`.
- Stop writing `ownerId`/`managedByOwnerId`/`caretakerIds`/`custodianIds`.

### 2.4 E2E steady state (gated on environment)

Playwright is installed but unconfigured. Add a seeded local environment and a
critical-path spec before removing fallbacks.

---

## 3. Exit Criteria

- [x] Read-only readiness audit implemented and tested.
- [x] Runbook published with daily audit and rollback steps.
- [ ] Daily reconciliation run green for one release cycle.
- [ ] Zero unexplained assignment/billing/block drift.
- [ ] Legacy public pages retired or redirected per product/SEO sign-off.
- [ ] `owner` aliases removed.
- [ ] Legacy owner fields are read-only/deprecated with a removal plan.
- [ ] Day-to-day rollback no longer needs legacy fallbacks.
- [ ] E2E steady-state suite passes.
- [ ] `tsc`, Biome, Vitest and `npm run build` pass.

---

## 4. Rollback

1. Re-enable any disabled fallback flag introduced during retirement.
2. Stop payout execution first (`COMMISSION_PAYOUTS_ENABLED=false`) if commission
   is implicated.
3. Preserve all ledgers and audit rows; never delete accruals, assignments or
   history.
4. Restore the previous deployment if authorization scoping regresses.
5. Re-run readiness and reconciliation before attempting retirement again.

---

## 5. Current Implementation Notes

Local work completes the audit foundation only:

- Added `src/lib/legacy-readiness.ts` and `src/lib/legacy-readiness.test.ts`
  (6 tests covering clean state, legacy references, owner-role users, orphan
  assignments, block/unit drift, billing drift and soft deletes).
- Added `scripts/phase9-readiness.ts` (read-only; exits non-zero on drift).
- Added `docs/runbooks/phase9-stabilisation.md` with daily order, escalation,
  rollback and the retirement-PR checklist.
- Verified `npx tsc --noEmit` and `npx vitest run src/lib/legacy-readiness.test.ts`.

Production-dependent retirement steps remain gated as described above. The next
step is running the audit against a production replica daily for one release
cycle and collecting the evidence pack for the retirement PR.
