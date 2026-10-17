# Phase 2 — Single allocation service

Part of [Simplify user flows](./README.md).
Status: spec ready · Depends on: **D2** · Risk: **medium** (concurrency)

> **Goal:** exactly one code path owns occupancy and lease state. Today four
> writers each do a partial job, and two of them (`PATCH /units`, `POST /leases`)
> can leave `Unit` and `Lease` out of sync.

## 1. Current writers

| Writer | File | Does | Misses |
|---|---|---|---|
| `assignUnitToTenant` | `src/lib/tenancy.ts` L68–123 | atomic claim unit, bind tenant, create lease | — (the good one) |
| `vacateTenantFromUnit` | `src/lib/tenancy.ts` L131–165 | free unit, end leases | legacy `tenantId` fallback |
| `applyMoveIn` | `src/app/api/v1/move-requests/[id]/route.ts` L73–117 | sets `unit.tenantId` + `save()` (**not atomic**), creates lease | race-safe claim |
| `applyMoveOut` | same file L120–141 | frees unit, ends lease | — |
| `PATCH /units/[id]` | `src/app/api/v1/units/[id]/route.ts` L90–94 | sets `unit.tenantId`, flips status | **no lease** |
| `POST /leases` | `src/app/api/v1/leases/route.ts` L103–113 | creates lease | **no occupancy** |

## 2. Target

One module — **`src/lib/allocation.ts`** — is the *only* code allowed to change
`Unit.tenantId` / `Unit.status` (between available↔occupied) or create/end active
`Lease` documents. Every route calls it.

```ts
export class AllocationError extends Error { readonly status: number }

allocateUnit(input: {
  tenantId: string;              // Tenant document _id
  unitId: string;
  rentAmount?: number;           // else unit.rent ?? property.price
  startDate?: Date;
  frequency?: "monthly";
  notes?: string;
}): Promise<{ unit: UnitDocument; tenant: TenantDocument; lease: LeaseDocument }>

vacateUnit(input: { tenantId: string }): Promise<{ tenant: TenantDocument }>
```

### `allocateUnit` steps

1. Load `Tenant` by id → `404` if missing.
2. Load `Unit` → `404` if missing.
3. `String(unit.propertyId) !== String(tenant.propertyId)` → `422` (same rule as today).
4. `resolveOccupantUserId(tenant)` (move from `tenancy.ts`) → `409` if unlinked.
5. **Atomic claim** (race-safe, copied from `tenancy.ts` L91–95):
   `Unit.findOneAndUpdate({ _id, status: "available", deletedAt: null },
   { $set: { tenantId: occupantUserId, status: "occupied" } }, { new: true })`
   → `409 "That unit is no longer vacant"` if `null`.
6. Bind tenant: `Tenant.updateOne({ _id }, { $set: { userId, status: "active",
   ...(wasInactive ? { joinedAt: new Date() } : {}) } })`.
7. **Upsert the active lease** (new): if an active lease for the tenant exists, set
   its `unitId`; else create one with `unitId`, rent, frequency, startDate.

### `vacateUnit` steps

1. Load `Tenant`; resolve occupant.
2. Find the occupied unit by `{ tenantId: occupantUserId, propertyId, status:"occupied" }`,
   falling back to `{ tenantId: String(tenant._id) }` for legacy rows
   (`tenancy.ts` L146–149).
3. `404` if none.
4. `Unit.updateOne({ _id, status: "occupied" }, { $set: { tenantId: "", status: "available" } })`.
5. `Lease.updateMany({ tenantId: String(tenant._id), status: "active" },
   { $set: { status: "ended", endDate: new Date() } })`.

### Atomicity

Steps 5–7 of `allocateUnit` should run in one Mongo transaction
(`mongoose.startSession()` + `withTransaction`) so a failed lease write cannot
leave an occupied unit with no lease. Atlas (the deployed target) is a replica
set, so transactions are available. **Fallback:** if a session is unavailable
(e.g. local single-node), run 5→7 in order and, on failure after the claim,
compensate by releasing the unit. The fallback path must be covered by a test.

## 3. Data model

`src/models/Lease.ts` — add the pointer (D2 Option A):

```ts
unitId: { type: String, default: "" },
```

```ts
leaseSchema.index({ unitId: 1, status: 1 });
```

The unique partial `{ tenantId }` active index (L40–47) is unchanged.

## 4. Route refactors

| File | Change |
|---|---|
| `src/lib/tenancy.ts` | `assignUnitToTenant` / `vacateTenantFromUnit` become thin wrappers delegating to `allocation.ts` (keep signatures so existing callers/tests compile) |
| `src/app/api/v1/move-requests/[id]/route.ts` | `applyMoveIn` → `allocateUnit`; `applyMoveOut` → `vacateUnit`; delete the duplicated logic |
| `src/app/api/v1/units/[id]/route.ts` | **remove** `tenantId` from `unitUpdateInput`; `PATCH` may only set `status` between `available`↔`maintenance`; reject `occupied`/`available` transitions that imply occupancy with `409 "Use tenant assignment to change occupancy"` |
| `src/lib/schemas/unit.ts` | drop `tenantId` |
| `src/app/api/v1/leases/route.ts` + `leaseInput` | add `unitId`; `POST` no longer *creates occupancy* — it requires the tenant to already occupy `unitId` (`409` otherwise) and records billing terms |
| `src/components/units/TenantUnitsView.tsx` | drop the passive **"Prefer"** action (D1: `UnitPreference` is dead in production); keep "Request this unit" |

## 5. Migration

`scripts/backfill-lease-unit-ids.ts` (NEW, `--dry-run` first):

1. For every `status:"active"` lease, resolve the tenant's occupant userId.
2. Find the unit currently occupied by that user in the lease's property.
3. If exactly one match, set `lease.unitId`; else log for manual review.

Live scope: **1 active lease** — the audit shows it already matches its unit, so the
dry-run should report 1 update and 0 conflicts.

## 6. Tests

- **New `src/lib/allocation.test.ts`**: allocate success; `409` when the unit was
  claimed concurrently (two calls, one wins); `422` for wrong property; `409` for
  unlinked tenant; upsert updates `unitId` on an existing active lease; vacate ends
  the lease and frees the unit; legacy fallback frees a unit pointing at a Tenant id.
- **Transaction fallback test**: lease write fails after claim → unit released.
- `move-requests/[id]/route.test.ts`: approving a move-in now creates a lease **with
  `unitId`**; approving a move-out frees the unit.
- `units/[id]/route.test.ts`: `PATCH` rejects `tenantId`, and rejects setting
  `status:"occupied"` directly.
- `leases/route.test.ts`: `POST` with a `unitId` the tenant does not occupy → `409`.

## 7. Acceptance criteria

1. `grep` shows no writer other than `src/lib/allocation.ts` mutating
   `Unit.tenantId`/`Unit.status` (occupancy) or creating active leases.
2. Every route that changes occupancy produces a matching active lease and vice
   versa — asserted by the tests above.
3. The concurrency test cannot produce two occupied units for one tenant, or one
   unit occupied by two tenants.
4. Existing suite stays green; `tsc`, Biome, build clean.

## 8. Edge cases

| Case | Behaviour |
|---|---|
| Two managers allocate the same unit | one `201`, one `409` (atomic claim) |
| Tenant already occupies a unit, allocated another | allocate returns `409` (tenant has an active lease / occupied unit) — decide explicitly: block or auto-vacate |
| Unit deleted mid-flight | soft-delete plugin filters it → `404` |
| Legacy `unit.tenantId` = Tenant doc id | vacate fallback still frees it |

## 9. If the decision differs

- **D2 = Unit.tenantId authoritative (Option B):** drop the `Lease.unitId` field and
  the backfill; keep `allocation.ts` as the single writer but treat `Lease` purely
  as billing (no pointer). The route refactors and tests are otherwise unchanged.
- **D1 = unify on `MoveRequest` (Option B):** the `move-requests` refactor stays,
  but `assignUnitToTenant` and the application flow are re-pointed in Phase 3.
