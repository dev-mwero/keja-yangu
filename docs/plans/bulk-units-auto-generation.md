# Plan: Bulk Auto-Generation of Floors/Units + Duplex Block Support

Status: **Planned — not yet implemented**
Created: 2026-11-08
Scope: frontend bulk-generation affordance in `PropertyStructureEditor` + duplex block/unit support, reusing the existing `PUT /api/v1/properties/[id]/structure` reconciliation route. No new endpoint.

## 1. Objective

Add two complementary features to the property structure editor:

1. **Bulk auto-generation** — specify floors + units-per-floor and auto-generate the structure.
2. **Duplex support** — a block (or individual floor) can be marked as "duplex", meaning every unit on that floor spans to the floor above. Units are named with a floor range (e.g. `3A-4A`) and count as 1 unit.

Both features must coexist with the existing per-floor editor and reconciliation.

## 2. User-confirmed decisions

### Bulk generation
| Question | Decision |
|---|---|
| Placement | Both create-property dialog **and** structure editor |
| Floor numbering | Checkbox "include ground floor" (default **on**); unchecked starts at floor 1 |
| Blocks | Single block (default "Block A") |
| Rent | Optional override field; otherwise inherit property price |
| Existing structure | Prompt: overwrite or append |
| Safety | Never bypass `MAX_UNITS_PER_PROPERTY` (2000) or duplicate-name validation |

### Duplex support
| Question | Decision |
|---|---|
| Duplex definition | A block type where every unit is duplex (spans 2 floors) |
| Duplex flag location | Block-level default, overridable per floor |
| Unit naming | Floor range (e.g. `3A-4A`), user can override |
| Unit counting | Counts as **1** unit toward `MAX_UNITS_PER_PROPERTY` |
| Bulk + duplex | Bulk generator supports duplex generation (option) |
| Floor removal | Block removal if a duplex unit occupies the next floor |

## 3. Affected surfaces

**Client / UI**
- `src/components/property/PropertyStructureEditor.tsx` — bulk generate + duplex toggle
- `src/components/dialogs/PropertyDialog.tsx` — create flow
- `src/components/property/PropertyStructureView.tsx` — edit flow
- `src/hooks/use-properties.tsx` — `BlockInputPayload` / `FloorInputPayload`

**Shared logic / validation**
- `src/lib/unit-naming.ts` — `buildUnitNames`, `defaultUnitName`, `floorPrefix`, `letterLabel`
- `src/lib/schemas/structure.ts` — `blockInput`/`floorInput`, `MAX_UNITS_PER_PROPERTY`, `effectiveRent`, `effectivePurpose`
- `src/lib/units.ts` — `buildUnitInserts`, `countRequestedUnits`
- `src/lib/property-structure.ts` — `planStructureUpdate`, `StructureError`

**API / data**
- `src/app/api/v1/properties/route.ts` — create path
- `src/app/api/v1/properties/[id]/structure/route.ts` — PUT reconciliation
- `src/models/Unit.ts` — unit schema (needs span info for duplex)

**New file**
- `src/lib/bulk-structure.ts` — pure generator + validators
- `src/lib/bulk-structure.test.ts` — unit tests

## 4. Design

### 4.1 Data model changes for duplex

**Block input** (`blockInput` / `structureBlockInput`):
- Add `duplex: z.boolean().default(false)` — block-level default

**Floor input** (`floorInput` / `structureFloorInput`):
- Add `duplex: z.boolean().nullable().optional()` — `null`/`undefined` inherits from block

**Unit schema** (`src/models/Unit.ts`):
- Add `spanFloors: z.number().int().min(1).max(2).default(1)` (1 = normal, 2 = duplex)
- Add `secondaryFloorId: string` (empty if single-floor) — references the floor above for duplex units
- Add `secondaryFloorLevel: number` (0 if single-floor) — for display/naming

**Unit naming for duplex:**
- `defaultUnitName` extended: if duplex, name = `${floorPrefix(level)}${letterLabel(index)}-${floorPrefix(level+1)}${letterLabel(index)}` (e.g. `3A-4A`)
- User can override via `unitNames` array

**Reconciliation changes (`planStructureUpdate`):**
- A duplex unit on floor N occupies floors N and N+1
- Removing floor N blocks if any duplex unit on floor N-1 spans into it
- Removing floor N+1 blocks if any duplex unit on floor N spans into it
- `unitsPerFloor` for a duplex floor counts as 1 unit per floor (not 2)
- When a floor's `duplex` flag changes, existing units on that floor are updated (span added/removed)
- Occupied duplex units block floor removal the same as normal units

### 4.2 Proposed pure generator API (bulk + duplex)

```ts
export interface BulkFloorSpec {
  floorCount: number;            // >= 0, <= 200
  unitsPerFloor: number;         // >= 0, <= 200
  includeGroundFloor: boolean;
  startLevel?: number;           // default 1
  floorRentOverride?: number | null; // null = inherit block/property rent
  customUnitNames?: string[];    // optional override; blanks fall back to generated
  duplex?: boolean;             // default false; per-floor override of block duplex
}

export interface BulkBlockSpec {
  name: string;                 // non-empty, unique case-insensitive
  duplex: boolean;              // block-level default (default false)
  floors: BulkFloorSpec;
  rentOverride?: number | null; // block-level; null = inherit property rent
}

export interface BulkGenerationInput {
  blocks: BulkBlockSpec[];
  existingUnitCount?: number;    // default 0
  mode?: "replace" | "append";
}

export class BulkStructureError extends Error { name = "BulkStructureError"; }

export function validateBulkGeneration(input): string[];
export function generateBulkFloors(spec): FloorInputPayload[];
export function generateBulkBlock(spec): BlockInputPayload;
export function generateBulkStructure(input): BlockInputPayload[];
```

### 4.3 Floor numbering rules (bulk)

- `includeGroundFloor === true`: levels `[0, startLevel, startLevel+1, …]` for `floorCount` floors
- `includeGroundFloor === false`: levels `[startLevel, startLevel+1, …]` for `floorCount` floors
- `unitNames` per floor = `buildUnitNames(level, unitsPerFloor, customUnitNames)` (with duplex suffix if applicable)
- Each generated floor has `label: ""` (display layer defaults)
- `rentOverride` is `null` unless explicitly provided
- `duplex` flag propagated from block to floor (floor can override)

### 4.4 UI placement

A **"Bulk generate"** button inside `PropertyStructureEditor` (works in both create dialog and structure view) opens a Radix Dialog form with:
- Floors to generate (number)
- Units per floor (number)
- Include ground floor (checkbox, default on)
- Starting floor level (number, default 1)
- Block name (text, default "Block A")
- **Duplex block** (checkbox, default off) — when on, all generated floors/units are duplex
- Per-floor duplex override (optional, in advanced section)
- Rent override (optional number)
- Generate / Cancel buttons

The per-floor editor remains fully available alongside it, with a duplex toggle per floor.

### 4.5 Replace vs append

- If no existing blocks → replace (no prompt)
- If existing blocks present → `window.confirm` (or AlertDialog) asking overwrite vs append
- On replace, server-side occupied-unit protection still applies (409 surfaced to user)

### 4.6 Block naming

Default "Block A". On append, if the name exists, validate and reject with an error (or auto-increment "Block B", …). Keep block-name uniqueness visible via existing `validateBlocks`.

### 4.7 Validation before `onChange`

- floors/units ranges (>= 0, <= caps)
- total `<= MAX_UNITS_PER_PROPERTY` for append (combined, duplex counts as 1)
- nonnegative rent override
- no multiple ground floors (levels <= 0 collide in naming)
- duplex on top floor: warn (no floor above to span into) or disable

## 5. Risks

### Duplex-specific risks
- **Top floor limitation**: a duplex unit on the top floor has no floor above. Must either disable duplex on the top floor or auto-convert to single-floor.
- **Floor removal cascading**: removing floor N blocks if a duplex on floor N-1 spans into it. Need to check both `unitsByFloor` and duplex span references.
- **Reconciliation complexity**: when a floor's duplex flag changes, existing units on that floor need span added/removed. The `NextFloor` interface needs a `duplex` field, and `planStructureUpdate` must handle span changes.
- **Unit count ambiguity**: a duplex unit occupies 2 floors but counts as 1. The `totalUnits` calculation in `planStructureUpdate` must count unique units, not floor-slots.
- **Naming uniqueness**: duplex names like `3A-4A` must be unique within a block; the `reserveName` logic must handle the range format.
- **Occupied duplex units**: same protection as normal units — cannot remove floor if duplex unit is occupied.

### Bulk-specific risks (carried over)
- **MAX_UNITS_PER_PROPERTY (2000)**: must be checked for combined structure on append
- **Ground-floor collision**: `floorPrefix` returns `G` for every level <= 0
- **Occupied-unit protection on overwrite**
- **State reset on dialog open**
- **Accessibility/keyboard**

## 6. Performance (advisory)

- `buildUnitNames` / `validateBlocks` / `summarizeStructure` are O(n) or better; no O(n²) risk at 2000 units
- Real risk is DOM rendering: `PropertyUnitsTable` is unvirtualized (16k DOM nodes at 2000 units). `UnitsView` already uses `@tanstack/react-virtual` — apply same pattern
- Server insert cost: structure route uses default `ordered: true` for `insertMany`; recommend `ordered: false` + chunking (500 docs/batch)
- Memoize: `validateBlocks`/`summarizeStructure` via `useMemo`; handlers via `useCallback`; `FloorRow` via `React.memo`
- Avoid persisting full default-name arrays in `unitNames`; store only overrides (sparse)
- Add `{ propertyId, deletedAt }` index

## 7. Ops / CI / observability

- **No new dependencies, env vars, or build changes.** No DB migration (but Unit schema gains `spanFloors`/`secondaryFloorId` fields — additive, backward compatible).
- **Audit gap**: `PUT /structure` emits no `AuditEvent`. Recommend adding `writeAuditEvent` after successful apply.
- **Partial-failure recovery**: recommend idempotent `scripts/reconcile-property-structure.ts`
- **Rate limiting**: structure endpoint not rate-limited; recommend adding existing middleware
- **Concurrency**: simultaneous bulk edits can race; recommend optimistic-concurrency check

## 8. Test strategy

### 8.1 Pure generator tests — `src/lib/bulk-structure.test.ts`
- Valid single block; empty block name; duplicate block names (case-insensitive); negative/non-integer counts; cap enforcement
- Floor numbering: with ground `[0,1,2]`, without ground `[1,2,3]`, custom start level
- Unit naming: ground floor `GA, GB, GC`; upper floors `{level}A…`; duplex `3A-4A`
- 0 floors → `[]`; 0 units/floor keeps floor with empty `unitNames`
- Floor labels empty; rent inherit vs override; throws on invalid input
- Duplex flag propagation from block to floor
- Multiple blocks with correct totals; throw on cap breach; throw on duplicate block names
- Duplex top-floor warning

### 8.2 Duplex reconciliation tests — `src/lib/property-structure.test.ts` (extend)
- Duplex unit on floor N spans floors N and N+1
- Removing floor N blocks if duplex on floor N-1 spans into it
- Removing floor N+1 blocks if duplex on floor N spans into it
- Duplex unit counts as 1 toward `MAX_UNITS_PER_PROPERTY`
- Floor duplex flag change updates existing units (span added/removed)
- Occupied duplex units block floor removal

### 8.3 Editor component tests — `PropertyStructureEditor.test.tsx` (extend)
- Duplex toggle per floor; block-level duplex default
- Bulk generate with duplex option
- Toggle open/closed; generate calls `onChange`; replace/append prompt; validation errors; disabled state

### 8.4 Integration tests
- `PropertyDialog.test.tsx`: create with bulk-generated duplex structure
- `PropertyStructureView.test.tsx`: bulk generate duplex then save; 409 on occupied duplex

### 8.5 Edge cases matrix
| Edge case | Expected |
|---|---|
| Duplex on top floor | Warning or disabled (no floor above to span into) |
| 0 floors | Generator returns `[]` |
| 0 units/floor | Floor retained, `unitsPerFloor: 0` |
| Huge count > cap | Validation error; Save disabled |
| Ground floor level 0 | Units prefixed `G` |
| Empty block name | Validation error |
| Overwrite existing | `window.confirm` |
| Disabled state | All controls disabled |

### 8.6 CI integration
- Targeted: `npm run test -- src/lib/bulk-structure.test.ts src/lib/property-structure.test.ts src/components/property/PropertyStructureEditor.test.tsx`
- Full: `npm run test` + `npm run test:coverage`
- Type safety: `npm run typecheck`
- Lint/format: `npm run check` (Biome)

## 9. Implementation order (suggested)

1. **Schema**: add `duplex` to block/floor inputs (zod), add `spanFloors`/`secondaryFloorId`/`secondaryFloorLevel` to Unit model
2. **Naming**: extend `defaultUnitName`/`buildUnitNames` for duplex range format
3. **Reconciliation**: update `planStructureUpdate` to handle duplex spans, floor removal blocking, unit count
4. **Pure generator**: create `src/lib/bulk-structure.ts` with duplex support + tests
5. **UI**: add duplex toggle to editor (block-level + per-floor override) + bulk generate dialog with duplex option
6. **Integration**: wire into `PropertyDialog` and `PropertyStructureView`
7. **Perf**: memoization, virtualization, `ordered: false` + chunking
8. **Ops**: audit event, reconcile script, rate limiting
9. **Verify**: full suite + build + tsc + biome

## 10. Open questions

1. Should duplex be a **block-level only** setting (simpler) or per-floor overridable (more flexible)? **Decision: block-level default, per-floor override.**
2. Should the **top floor** of a duplex block be auto-converted to single-floor units, or should duplex be disabled on the top floor? **Decision: disable duplex on top floor (warn user).**
3. Should **rent** for duplex units be per-unit (spanning 2 floors) or split across floors? **Decision: per-unit (one rent value for the whole duplex).**
4. Should **bulk generation** allow mixing normal and duplex floors in the same block? **Decision: block-level duplex default; per-floor override allows mixing.**
5. How should **existing non-duplex units** be handled when a floor is toggled to duplex? **Decision: convert to duplex (span to next floor) if possible, else warn.**

## 11. Merge with bulk units plan

This plan **extends** the bulk-units-auto-generation plan. The bulk generator gains a `duplex` option on `BulkBlockSpec` and `BulkFloorSpec`, and the generated floor/unit names reflect the duplex range format. The two features share:

- The same `PropertyStructureEditor` UI (bulk generate button + duplex toggles)
- The same `planStructureUpdate` reconciliation (duplex span handling)
- The same `MAX_UNITS_PER_PROPERTY` cap (duplex counts as 1)
- The same validation pipeline (`validateBlocks` + `validateBulkGeneration`)

The bulk plan's implementation order is updated to include duplex schema changes (step 1) before the generator (step 4).

## 12. Verification checklist (before claiming done)

- [ ] `npm run typecheck` clean
- [ ] `npm run check` clean
- [ ] `npm run test` green (targeted + full)
- [ ] `npm run build` succeeds
- [ ] Manual smoke: create duplex block → save → units span 2 floors → edit structure → remove floor blocked by duplex → 409 surfaced
- [ ] Bulk generate duplex block → save → units appear with range names
- [ ] No regression in existing structure tests
- [ ] Audit event emitted on structure update
