# Assign tenant from Manage Structure Units table — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Assign tenant" action to available units in the Manage Structure → Units table so managers can assign an unassigned active tenant to a vacant unit without leaving the structure page.

**Architecture:** Reuse the existing allocation path. The API (`POST /api/v1/tenants/:id/assignment`) and service (`assignUnitToTenant` → `allocateUnit`) are already the single-writer for occupancy. The UI reuses the dialog pattern from `TenantsManager`. We only need to fetch unassigned active tenants for the property (via `GET /api/v1/tenants?propertyId=...&status=active`) and surface an Assign action on `unit.status === "available"`.

**Tech Stack:** Next.js App Router, React, TypeScript, Mongoose, zod, Vitest + Testing Library, shadcn/ui.

**Spec:** This implements the user request “add assign unit / move-in among the manage structure actions, so that it be easy to do these actions.” It deliberately uses “Assign tenant” (direct assignment) rather than creating a move-in request to avoid conflating the two flows; approval-based move-in remains in the Requests area.

## Global Constraints

- Follow repo conventions: hooks call the API with `fetch`, mutations set `pending` state, errors surfaced via `toast.error`/`sonner`.
- No changes to `src/lib/allocation.ts` or the assignment API route.
- Use the existing `assignUnit(id, unitId)` from `useTenants()` (calls `POST /api/v1/tenants/:id/assignment`).
- The tenants list already supports `propertyId` and `status` filters on `GET /api/v1/tenants`.
- Biome/TypeScript checks must pass. Run `npx vitest run <file>` per task, full `npx vitest run` before task-end commits that touch multiple areas.
- Keep changes minimal and consistent with surrounding code style.

## Review Focus

1. **Scope leak:** The property-scoped tenants query must only include active tenants at that property; do not accidentally surface tenants from other properties.
2. **Unassigned filter:** Only unassigned tenants (no current unit) should appear in the Assign dialog; assigning an already-assigned tenant would be blocked by the API, but we should not present confusing choices.
3. **Dialog state:** Opening/closing the Assign dialog must clear `selectedTenantId` and not leave stale state across units/properties.
4. **Disabled states:** "Assign tenant" action must not appear for non-available units; the confirm button must be disabled until a tenant is selected and no mutation is pending.
5. **Refetch on success:** After assignment, both units list and occupancy counts must refresh (call `refetch()` and `onChanged?.()`), otherwise the UI appears stale.

---

### Task 1: Add hook to fetch unassigned active tenants for a property

We need a small hook to load tenants filtered by `propertyId` and `status="active"`, and expose `unassignedTenants` (those with no current unit). `useTenants` already returns enriched rows including `unit`/`requestedUnit`; reuse that shape.

**Files:**
- Modify: `src/hooks/use-tenants.tsx` — add `usePropertyTenants(propertyId?: string)` hook (or extend `useTenants` to accept optional `propertyId`/`status` filters). Keep existing signature unchanged.

**Interfaces:**
- Consumes: `GET /api/v1/tenants?propertyId=...&status=active`
- Produces: `usePropertyTenants(propertyId)` returns `{ tenants: Tenant[], unassignedTenants: Tenant[], loading, error, refetch }` where `Tenant` matches `useTenants`' return shape (`unit?: TenantUnitSummary | null`, `requestedUnit?`, etc.). `unassignedTenants = tenants.filter(t => !t.unit)`.

- [ ] **Step 1: Write the failing test (unit)**
Add a test in `src/hooks/use-tenants.test.tsx`. Mock `fetch` and assert the query includes `propertyId` and `status=active`, and that `unassignedTenants` excludes a tenant who already has `unit`.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run src/hooks/use-tenants.test.tsx -t "property tenants"`
Expected: FAIL — hook doesn't exist or doesn't filter.

- [ ] **Step 3: Implement `usePropertyTenants`**
In `src/hooks/use-tenants.tsx`, add:
```ts
export function usePropertyTenants(propertyId?: string) {
  const filters = propertyId ? { propertyId, status: "active" as const } : undefined;
  const { tenants, loading, error, refetch } = useTenants(filters);
  const unassignedTenants = useMemo(
    () => tenants.filter((t) => !t.unit),
    [tenants],
  );
  return { tenants, unassignedTenants, loading, error, refetch };
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run src/hooks/use-tenants.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/hooks/use-tenants.tsx src/hooks/use-tenants.test.tsx
git commit -m "feat(tenants): add usePropertyTenants hook for unassigned active tenants"
```

---

### Task 2: Add Assign tenant action to PropertyUnitsTable for available units

Add UI: for `canManage && unit.status === "available"`, show an "Assign tenant" icon/button. Clicking opens a dialog listing `unassignedTenants` for `propertyId`; selecting one and confirming calls `assignUnit(tenantId, unit._id)`. On success: close dialog, clear selection, `refetch()` units, call `onChanged?.()`, toast success. On error: toast error. Disable confirm while `pending`.

**Files:**
- Modify: `src/components/property/PropertyUnitsTable.tsx`
- Test: `src/components/property/PropertyUnitsTable.test.tsx` (add cases)

**Interfaces:**
- Consumes: `usePropertyTenants(propertyId)`, `useTenants().assignUnit`, `useUnits()` refetch, `onChanged()`.
- Produces: no exported API change — UI-only.

- [ ] **Step 1: Write the failing test**
In `src/components/property/PropertyUnitsTable.test.tsx`, add test that shows Assign tenant action for available units and assigns a tenant; also add a case: occupied unit must NOT show Assign action.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run src/components/property/PropertyUnitsTable.test.tsx -t "Assign tenant"`
Expected: FAIL — action/button/dialog not present.

- [ ] **Step 3: Implement UI changes**
In `src/components/property/PropertyUnitsTable.tsx`:
- Import `UserPlus` from `lucide-react`, and `usePropertyTenants`, `useTenants` from `@/hooks/use-tenants`.
- Destructure: `const { unassignedTenants, loading: tenantsLoading } = usePropertyTenants(propertyId)` and `const { assignUnit, pending: assignPending } = useTenants()`.
- Add state: `const [assigningUnit, setAssigningUnit] = useState<Unit | null>(null)` and `const [selectedTenantId, setSelectedTenantId] = useState<string>("")`.
- In Actions cell, when `unit.status === "available"`, render an `Assign tenant` button (icon `UserPlus`, `aria-label={`Assign tenant to ${unit.name}`}`) that calls `setAssigningUnit(unit)`.
- Add a `Dialog` controlled by `assigningUnit !== null`. List `unassignedTenants` in `Select`; disable Confirm when `!selectedTenantId || assignPending`.
- On confirm: call `assignUnit(selectedTenantId, assigningUnit._id)`, toast success, close dialog, clear selection, `refetch()`, `onChanged?.()`. On error: toast error.

- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run src/components/property/PropertyUnitsTable.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/components/property/PropertyUnitsTable.tsx src/components/property/PropertyUnitsTable.test.tsx src/hooks/use-tenants.tsx src/hooks/use-tenants.test.tsx
git commit -m "feat(structure): add assign-tenant action to available units in manage structure"
```

---

### Task 3: Quick smoke + full suite

Verify the new action doesn't regress existing behavior and the full suite stays green.

- [ ] **Step 1: Run focused checks**
Run: `npx tsc --noEmit && npx biome check src/components/property/PropertyUnitsTable.tsx src/hooks/use-tenants.tsx 2>&1 | tail -5`

- [ ] **Step 2: Run full test suite**
Run: `npx vitest run`
Expected: all tests pass (no new failures).
