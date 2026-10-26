# Plan: Property Completion Date & Hierarchy-wide Purpose (with Overrides)

**Status:** Proposed  
**Author:** Antigravity  
**Date:** 2026-10-26  

---

## 1. Goal

1. **Date Completed:** Add `dateCompleted` (optional date / ISO string) to the `Property` model so owners/managers can track when the property was built or completed.
2. **Purpose with Hierarchy Overrides:**
   - Supported purpose values: `"residential"` (default), `"commercial"`, `"storage"`, `"other"`.
   - Set at the `Property` level (default `"residential"`).
   - Can be overridden at the:
     - **Block level** (`block.purpose` — optional, falls back to property purpose)
     - **Floor level** (`floor.purpose` — optional, falls back to block purpose if set, else property purpose)
     - **Unit level** (`unit.purpose` — optional, falls back to floor > block > property purpose)
   - Follow the same proven hierarchical override pattern used for `effectiveRent(...)`:
     $$\text{effectivePurpose}(\text{unit}, \text{floor}, \text{block}, \text{property}) = \text{unit.purpose} \lor \text{floor.purpose} \lor \text{block.purpose} \lor \text{property.purpose} \lor \text{"residential"}$$

---

## 2. Data Models & Schemas

### 2.1 Domain Enums / Types (`src/lib/domain-enums.ts` or `src/lib/property-purpose.ts`)
```ts
export const PROPERTY_PURPOSES = ["residential", "commercial", "storage", "other"] as const;
export type PropertyPurpose = (typeof PROPERTY_PURPOSES)[number];
export const DEFAULT_PROPERTY_PURPOSE: PropertyPurpose = "residential";
```

### 2.2 `Property` Model (`src/models/Property.ts`)
- **`floorSchema`:**
  - `purpose: { type: String, enum: [...PROPERTY_PURPOSES, null], default: null }`
- **`blockSchema`:**
  - `purpose: { type: String, enum: [...PROPERTY_PURPOSES, null], default: null }`
- **`propertySchema`:**
  - `dateCompleted: { type: Date, default: null }`
  - `purpose: { type: String, enum: [...PROPERTY_PURPOSES], default: "residential" }`

### 2.3 `Unit` Model (`src/models/Unit.ts`)
- `unitSchema`:
  - `purpose: { type: String, enum: [...PROPERTY_PURPOSES, null], default: null }`

---

## 3. Schemas & Validation

### 3.1 Structure Schemas (`src/lib/schemas/structure.ts`)
- `floorInput`:
  - `purpose: z.enum(PROPERTY_PURPOSES).nullable().optional()`
- `blockInput`:
  - `purpose: z.enum(PROPERTY_PURPOSES).nullable().optional()`
- `UnitInsert`:
  - `purpose?: PropertyPurpose | null`
- Export `effectivePurpose(...)`:
  ```ts
  export function effectivePurpose(
    unitPurpose?: PropertyPurpose | null,
    floorPurpose?: PropertyPurpose | null,
    blockPurpose?: PropertyPurpose | null,
    propertyPurpose?: PropertyPurpose | null,
  ): PropertyPurpose {
    return unitPurpose ?? floorPurpose ?? blockPurpose ?? propertyPurpose ?? "residential";
  }
  ```

### 3.2 Property Route Input (`src/app/api/v1/properties/route.ts` & `[id]/route.ts`)
- `propertyInput`:
  - `dateCompleted: z.coerce.date().nullable().optional()`
  - `purpose: z.enum(PROPERTY_PURPOSES).optional().default("residential")`

### 3.3 Unit Update Input (`src/lib/schemas/unit.ts`)
- `unitUpdateInput`:
  - `purpose: z.enum(PROPERTY_PURPOSES).nullable().optional()`

---

## 4. Hierarchy Reconciliation & Unit Materialization

### 4.1 Unit Generation on Property Create (`src/lib/units.ts`)
When building unit inserts:
- Materialize `unit.purpose` as `floor.purpose ?? block.purpose ?? property.purpose ?? "residential"` (or keep as `floor.purpose ?? block.purpose ?? null` so unit explicitly tracks overrides). Keeping unit `purpose: null` unless specifically overridden allows future block/floor purpose edits to flow through.

### 4.2 Property Structure Updates (`src/lib/property-structure.ts`)
- Include `purpose` in `NextBlock` and `NextFloor`.
- Preserve/update `purpose` on blocks and floors when updating structure.

---

## 5. UI & Component Changes

1. **`PropertyDialog.tsx` (Create & Edit Property):**
   - Add "Date completed" date picker or input.
   - Add "Property purpose" dropdown selector (`residential`, `commercial`, `storage`, `other`).
2. **`PropertyStructureEditor.tsx` (Blocks & Floors):**
   - Add optional Purpose override selector at the Block level ("Inherit from Property" + explicit options).
   - Add optional Purpose override selector at the Floor level ("Inherit from Block" + explicit options).
3. **`PropertyUnitsTable.tsx` & `UnitsView.tsx`:**
   - Display effective purpose badge or column per unit.
   - Edit Unit modal allows setting/overriding Purpose (`Inherit` / `Residential` / `Commercial` / `Storage` / `Other`).

---

## 6. Implementation Checklist

- [ ] Create domain enum and helper `effectivePurpose(...)`
- [ ] Update `Property` and `Unit` Mongoose schemas + write schema unit tests
- [ ] Update `src/lib/schemas/structure.ts`, `src/lib/schemas/unit.ts`, and properties API routes
- [ ] Update `buildUnitInserts` in `src/lib/units.ts` and reconciliation in `src/lib/property-structure.ts`
- [ ] Update `useProperties` and `useUnits` TypeScript interfaces and factories
- [ ] Update UI components (`PropertyDialog`, `PropertyStructureEditor`, `PropertyUnitsTable`)
- [ ] Run `npx tsc --noEmit` and `npx @biomejs/biome check`
- [ ] Run full test suite `npx vitest run` to ensure all existing and new tests pass cleanly

