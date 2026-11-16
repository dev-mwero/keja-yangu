# P2 — Per-unit scoping for multi-tenancy

Follow-up to `feat/p3-multi-unit` (which relaxed the Lease unique index and
exposed a tenancy array). The API layer is already multi-tenant aware
(`resolveTenantIds` returns all of a user's tenant rows and the invoice/payment
routes filter with `tenantId: { $in: tenantIds }`). The remaining gaps are in
the tenant-facing UI and a few single-tenancy assumptions.

## Status

| # | Item | Status |
|---|---|---|
| 1 | Lease unique index relaxed (tenant+unit) | ✅ Done (p3) |
| 2 | `tenant/me` returns array; `useMyTenancy` exposes `tenancies` | ✅ Done (p3) |
| 3 | Tenant home selector | ✅ Done (p3) |
| 4 | Invoices API multi-tenant scoping | ✅ Already (resolveTenantIds) |
| 5 | Payments status API multi-tenant scoping | ✅ Already (resolveTenantIds) |
| 6 | Move-requests API tenant scoping | ✅ Already (requestedById = userId) |
| 7 | `TenantRequestsPanel` aggregate across tenancies | ⬜ Pending |
| 8 | `TenantUnitsView` aggregate across tenancies | ⬜ Pending |
| 9 | `TenantRequestsPanel` move-in/out unit picker across tenancies | ⬜ Pending |
| 10 | Tests for multi-tenancy scoping | ⬜ Pending |

## Gaps and approach

### 7. TenantRequestsPanel
**Current:** `const { tenancy } = useMyTenancy();` then `propertyId = tenancy?.propertyId`. Only one property's units are loaded and move-out requests are tied to that single property.

**Fix:** switch to `tenancies` from `useMyTenancy()`:
- Aggregate `propertyId`s across all tenancies.
- Load units for all of them (parallel `useUnits` calls, or a single call with multiple propertyIds if the hook supports it — check `use-units`).
- Move-out request uses the selected/occupied unit's propertyId.
- Move-in request's propertyId comes from the chosen unit's property.

### 8. TenantUnitsView
**Current:** loads units for `tenancy?.propertyId` only.

**Fix:** iterate over all tenancies, load vacant units per property, and merge into one list (tagging each with its property title). The "Request this unit" action uses that unit's propertyId.

### 9. TenantRequestsPanel unit picker
Move-in request currently picks from `availableUnits` of a single property. With multiple tenancies, the picker should group units by property or show property title alongside unit name.

## Tier 2 triggers
- None new: the data contract (tenant/me returning an array) is already established. This is UI-only aggregation. No schema change.

## Risks
- `useUnits` hook signature: verify it accepts multiple propertyIds or needs one call per property.
- Performance: N properties → N unit fetches. Acceptable for typical tenant (1–3 tenancies).
- Backward compat: `tenancy` (primary) still returned; existing consumers unaffected.

## Verification
- tsc, biome, vitest green.
- Manual smoke: tenant with 2 tenancies sees units/requests for both; move-in request targets the correct property.

## Recommended scope for this pass
Items 7–9 (UI aggregation) + update the two existing tests (home, requests) to mock `tenancies`. Item 10 (new tests) optional.