# Feature Plan: Blocks / Floors / Units Management + Client Vacant Unit Selection

## Branch
`feature/blocks-flows-units-management` (from `main` at merge `92e68ae`)

> "flows" in the original request means **floors**.

## 1. Overview
- **Goal**: give managers (owner / caretaker / custodian / system-admin) a dedicated
  page to manage a property's blocks, floors and units; give clients (tenants) a way
  to browse vacant unit details and choose a preferred unit in a preferred block/floor.
- **Key insight (correction to the first draft)**: the model and most CRUD already
  exist. `Property.blocks` holds block → floor subdocs; a separate `Unit` collection is
  materialized from that structure at property creation. Units can already be listed
  and edited (`/api/v1/units[/id]`, `UnitsView`, `/dashboard/{role}/units`).
- **The real gaps** are:
  1. Blocks/floors are **create-only** — `PropertyStructureEditor` renders only in the
     property create dialog and `propertyUpdate` does not accept `blocks`. There is no
     way to edit the structure of an existing property, and no unit reconciliation.
  2. There is **no client vacant-unit browse / preference** flow at all.

## 2. Existing model (reused — no migrations)
- `Property.blocks`: `blockSchema` `{ _id, name, order, rentOverride, floors[] }` and
  `floorSchema` `{ _id, level, label, unitsPerFloor, rentOverride }`.
- `Unit`: `propertyId, ownerId, blockId, blockName, floorId, floorLevel, floorLabel,
  name, letter, status, rent, beds, baths, area, tenantId, deletedAt`. Unique
  `{blockId, name}` partial on `{deletedAt: null}`; `{propertyId,status}`;
  `{ownerId,status}`; `{blockId,floorLevel}`. `UNIT_STATUSES` in `src/lib/domain-enums.ts`.
- Helpers: `buildUnitInserts`, `countRequestedUnits`, `MAX_UNITS_PER_PROPERTY`
  (`src/lib/schemas/structure.ts`); `buildUnitNames`, `defaultUnitName`, `letterLabel`
  (`src/lib/unit-naming.ts`).

## 3. Part A — Manager structure editing (DONE)
Replaced the naive "push a block" idea. A structure edit is a **reconciliation**, not a
blind replace, because unit `_id`s are referenced by move requests and invoices.

| Item | Where |
|---|---|
| Update schemas (blocks/floors with optional subdoc `id`) | `src/lib/schemas/structure.ts` |
| Reconciliation planner (pure, unit-tested) | `src/lib/property-structure.ts` |
| `PUT /api/v1/properties/[id]/structure` | `src/app/api/v1/properties/[id]/structure/route.ts` |
| Manager page | `src/components/property/PropertyStructureView.tsx` |
| Routes | `/dashboard/{owner,caretaker,custodian,system-admin}/portfolio/[id]/structure` |
| Entry point | "Manage structure" action on `PropertyCardWithActions` + caretaker portfolio |

**Planner invariants** (`StructureError` → HTTP 409):
- A block/floor holding an occupied unit cannot be removed.
- `unitsPerFloor` cannot drop below the number of occupied units on a floor.
- Unit names stay unique within a block.
- The property never exceeds `MAX_UNITS_PER_PROPERTY`.
- Existing unit ids are preserved (edits/renames in place; only vacant surplus removed).

**Apply order** in the route: soft-delete removed units first (frees `{blockId,name}`
for the partial unique index), then update surviving units, then insert new units, then
persist `Property.blocks`.

**Auth**: `requirePermission(request, "property:edit", { resource: property })` — owner,
custodian, or caretaker with `edit_property` on the managed owner's property.

**Verification**: `tsc` clean, `biome` clean, 1125/1125 tests pass (+20 new), build
succeeds; live `PUT` returns 401 unauthenticated.

## 4. Part B — Client vacant-unit browse + prefer (WITHDRAWN)
- **Status**: WITHDRAWN — superseded by `simplify-user-flows` Phase 6.
  `UnitPreference`, `unit:prefer`, `use-unit-preferences` and `PUT /units/[id]/prefer`
  were all retired in Phase 6 (`32bc470`). The client vacant-unit browse/prefer flow
  is superseded by the prospect-picks-a-unit flow (Phase 1 of that programme).
  No code from this section was ever built; nothing to remove.

## 5. Delivery / Ops
- No DB schema changes for Part A. Part B is WITHDRAWN (§4) — no new collection.
- Docker: `output: isVercel ? undefined : "standalone"` already fixed in `next.config.ts`.
- `tsc --noEmit` and `biome check` must stay clean; route tests mock `@/lib/mongoose`
  and `@/models/*` and import the route after mocks.

## 6. Test strategy
- Planner unit tests: `src/lib/property-structure.test.ts` (11 cases).
- Route tests: `src/app/api/v1/properties/[id]/structure/route.test.ts` (9 cases).
- Part B: WITHDRAWN (§4) — no `PUT /units/[id]/prefer` route, no `UnitsView` client test.
- No regressions: full suite green (currently 1125).

## 7. Risk flags
- **Orphaning referenced units** — mitigated by id-preserving reconciliation (never
  rebuild units from scratch).
- **Name-uniqueness collisions** on `{blockId, name}` — planner guards and the route
  soft-deletes before inserting.
- **Occupied-unit data loss** — every destructive path checks `status`/`tenantId` first.
- **Partial writes** — no transactions used (consistent with the existing create flow);
  order chosen so a mid-flight failure is recoverable and structure never points at
  missing units.

## 8. Next steps
1. Commit Part A on this branch.
2. Part B is WITHDRAWN (§4) — nothing to implement.
3. Run `tsc`, `biome`, targeted tests, full suite, build.
4. Merge `dev` → `main` when approved.
