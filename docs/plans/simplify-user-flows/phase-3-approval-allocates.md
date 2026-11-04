# Phase 3 — Approval allocates the unit

Part of [Simplify user flows](./README.md).
Status: **shipped** (`ddc21e1`) · Depends on: **D1, D2** · Risk: medium

> **Goal:** make *"accepted ⇒ moved in"* literally true. Today approving an
> application admits the applicant as a tenant but does **not** put them in a unit;
> a second, separate step (assignment or a move-in request) is required. After
> Phase 1 the application already carries `unitId`; after Phase 2 the
> `allocateUnit` service already exists. Phase 3 joins them.

## 1. Current behaviour

- `PATCH /api/v1/applications/[id]` (`src/app/api/v1/applications/[id]/route.ts`):
  sets `status`, `decisionNote`, `decidedById`, `decidedAt` (L42–46), then on the
  first transition to `approved` calls `admitApprovedApplicant` (L51–53), which only
  creates or binds the `Tenant` record (L58–95). **No unit allocation.**
- The unit is chosen later via `assignUnitToTenant` or a `move-in` MoveRequest.

## 2. Target

On the first transition to `approved`, approve **and** allocate in one operation:

```
approve(application):
  admit applicant          (create/bind Tenant)          — idempotent
  if application.unitId:
      allocateUnit({ tenantId, unitId })                 — may throw AllocationError
  persist status = "approved" + decision fields
```

### Ordering (important)

Persist the decision **last**, so a failed allocation leaves the application
**pending** and the manager can pick another unit. Today the status is written
first (L42–46) — that must be reordered.

### Atomicity

Ideal: one transaction spanning `Tenant` upsert + `Unit` claim + `Lease` upsert +
`Application` update. If a transaction is not used, the sequence above is already
safe because:
- `admitApprovedApplicant` is idempotent (find-or-create by `{propertyId,email}`);
- `allocateUnit` claim is atomic (Phase 2) and throws before any decision write.

So a partial failure leaves at most a created-but-unallocated `Tenant` — the exact
state today's approval produces, and harmless.

### Idempotency

Keep the existing `previousStatus !== "approved"` guard (L51): re-approving must
not create a second tenant or lease.

### Legacy applications (no `unitId`)

Back-compat: `unitId === ""` → admit only (today's behaviour). The manager UI should
prompt to choose a unit first; the target flow always has one.

## 3. Contracts

`PATCH /api/v1/applications/[id]` (unchanged body: `{ status, decisionNote? }`).

| Condition | Response |
|---|---|
| `approved`, has `unitId`, unit free | `200` — app approved, unit occupied, lease active |
| `approved`, has `unitId`, unit taken/unavailable | `409 { error }` — **application stays `pending`** |
| `approved`, cross-property / missing unit | `400` / `404` — stays `pending` |
| `approved`, no `unitId` | `200` — admit only (legacy) |
| `rejected` | `200` — decision recorded, no occupancy |
| re-`approved` (already approved) | `200` — idempotent no-op |

## 4. UI

- `src/components/applications/ApplicationsView.tsx`: show the requested **unit** on
  the row (Phase 1) and in the decision dialog. If the application has no unit,
  surface *"Choose a unit before approving"* rather than a bare Approve.
- Consider a combined **"Approve & move in"** label for the action when a unit is
  present, and a plain **"Admit"** when it is not.

## 5. Files changed

| File | Change |
|---|---|
| `src/app/api/v1/applications/[id]/route.ts` | reorder decision write after allocation; call `allocateUnit` when `unitId` present; map `AllocationError.status` |
| `src/components/applications/ApplicationsView.tsx` | show unit; guard Approve when no unit |
| tests | see §6 |

## 6. Tests

- Approve with a free `unitId` → application `approved`; tenant exists; unit
  `occupied`; one `active` lease with that `unitId`.
- Approve with a taken `unitId` → `409`; application still `pending`; no lease; no
  occupancy change.
- Approve with `unitId` from another property → `400`; stays pending.
- Approve with no `unitId` → legacy admit-only path (unchanged assertions).
- Re-approve → no second lease / no duplicate tenant.
- Reject after approve → decision recorded; occupancy **not** reversed (documented).

## 7. Acceptance criteria

1. A manager approving an application that carries a unit ends the request with the
   applicant occupying that unit and an active lease — in a single request.
2. If allocation cannot complete, the application remains pending and no partial
   occupancy/lease exists.
3. Legacy behaviour (approve without a unit) still works.
4. Suite green; `tsc`, Biome, build clean.

## 8. Edge cases

| Case | Behaviour |
|---|---|
| Unit taken between prospect submit and manager approve | `409`, stays pending |
| Approve → reject → approve again | second approve re-allocates only if still pending/free |
| Applicant already a tenant elsewhere | `allocateUnit` blocks a second active occupancy (Phase 2 rule) |
| Two managers approve simultaneously | `previousStatus` guard + atomic claim → exactly one allocation |

## 9. Rollout / notes

- No migration. The one existing **approved** application is already decided, so it
  is not re-processed; optionally backfill its `unitId` for the record.
- Notifications to the applicant on approval are **out of scope** here; wire them
  with the existing notification helpers in a follow-up.

## 10. If the decision differs

- **D1 = unify on `MoveRequest` (Option B):** this phase instead makes *move-in
  approval* the allocator (it already half-does this at
  `move-requests/[id]/route.ts` L73–117); applications become the intake that
  creates the move-in request.
