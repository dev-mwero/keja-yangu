# P1 — Pending Features Plan

Companion to the P0 fixes (CI green, ops scripts, Playwright browser). This document scopes the four pending features identified during the repo analysis. P0 is complete and verified (`biome`/`tsc`/`vitest`/`next build`/ops scripts/E2E all green).

## Status

| # | Feature | Status | Owner |
|---|---|---|---|
| 1 | Broker dashboard nav dead links | ✅ Done (this pass) | — |
| 2 | Tasks & Maintenance persistence (localStorage → API) | Planned | TBD |
| 3 | Multi-unit tenancy (tenant sees/holds multiple units) | ✅ Done (`71a7cc1`) | — |
| 4 | Legacy `owner` role retirement (Phase 9 exit criteria) | ✅ Done (`2afb68a`, `ae42be1`) | — |

---

## 1. Broker dashboard nav dead links — ✅ DONE

**Problem:** `src/config/dashboardNav.ts` `brokerSections` used slugs (`/listings`, `/authorizations`, `/prospects`, `#commissions`, `/profile`) that resolved to non-existent routes → 404s. Only `/dashboard/broker` existed.

**Fix applied:**
- Extracted the broker page body into `src/components/broker/BrokerDashboard.tsx` accepting an `initialTab` prop (synced via `useEffect`).
- Created real sub-routes: `/dashboard/broker/{listings,authorizations,prospects,commissions,profile}`.
- Changed `#commissions` → `/commissions` so it resolves to a real route (and gets proper active-highlighting in `DashboardShell`).
- `/dashboard/broker` defaults to the `listings` tab.

**Verification:** `next build` registers all 6 routes; `tsc`/`biome` clean.

---

## 2. Tasks & Maintenance persistence (localStorage → API)

**Current state:** `MaintenanceTask` lives only in `localStorage` via `createLocalStore` (`src/lib/local-store.ts`), seeded from `src/data/dashboard.ts`. Three dashboards (admin/owner/caretaker) share the same `tasksStore`. No DB model, no API, no RBAC beyond client-side.

**Goal:** Persist tasks in MongoDB, scoped by property/owner/assignee, with proper auth and audit.

**Tier 2 triggers:** new cross-service data contract (Task collection ownership) → `@database-architect` for schema/index/migration; RBAC implications → `@security-expert` for authorization design. Invoke both before implementation.

### Scope
- **Model:** `src/models/Task.ts` — fields: `title`, `propertyId`, `propertyName` (denorm), `priority` (low/medium/high), `status` (open/in-progress/done), `assignedTo` (userId), `createdBy` (userId + role), `dueDate`, `completedAt`, `notes`, timestamps. Indexes: `{ propertyId, status }`, `{ assignedTo, status }`, `{ createdBy }`.
- **API:** `GET/POST /api/v1/tasks` (list with filters: propertyId, status, assignedTo; paginated), `GET/PATCH/DELETE /api/v1/tasks/[id]`. Role gating: caretaker/owner/admin/system-admin can create; assignee or creator or owner-admin can update status; delete by creator or admin.
- **Validation:** zod schemas in `src/lib/schemas/task.ts` (follow `keja-yangu-conventions`).
- **UI migration:** replace `useLocalStore<MaintenanceTask>(tasksStore)` with a `useTasks` hook (SWR or fetch + mutate) in the 3 task pages; keep the same UX (filters, create dialog, status transitions). Seed data becomes a one-time migration script (optional; can drop seed).
- **Tests:** model unit tests, API route tests (auth matrix), UI smoke. Follow `vitest` patterns in `src/app/api/v1/**/__tests__`.

### Risks
- Data migration: existing users have localStorage tasks that will be lost. Provide an optional "import local tasks" one-shot on first load, or document the loss. Recommend documenting (no auto-migration) to keep scope small.
- RBAC: task visibility must respect property ownership/assignment (reuse `lib/authorization.ts`).

### Verification
- `tsc`, `biome`, `vitest` green; manual smoke of create→assign→complete→delete across the 3 roles.

---

## 3. Multi-unit tenancy (tenant holds/sees multiple units) — ✅ DONE

Delivered: `Lease` uniqueness relaxed to `{ tenantId, unitId }` (partial,
active-only), tenant home renders a tenancy selector, and `/api/v1/tenant/me`
aggregates units/requests across all tenancies (`71a7cc1`). Kept below for the
design rationale.

**Current state:** `Lease` has a unique active-lease-per-tenant index (`src/models/Lease.ts`); `tenant/home/page.tsx` does `units.find(...)` and renders a single unit. `docs/plans/tenant-types-multiunit-prospect.md` covers part of this.

**Goal:** A tenant can be associated with multiple active leases/units and switch between them in "My Home".

**Tier 2 triggers:** schema change (Lease index) + cross-system data contract (tenant home API) → `@database-architect` + `@principal-architect`. Invoke before implementation.

### Scope
- **Schema:** relax the unique active-lease-per-tenant index to allow multiple active leases per tenant (add `unitId` to the uniqueness constraint instead: one active lease per tenant-per-unit).
- **API:** `GET /api/v1/tenant/home` (or existing) returns an array of active units/leases; client selects active via query param or state.
- **UI:** `tenant/home/page.tsx` renders a unit selector when >1 active lease; default to the first/last-used (persist selection in a cookie or localStorage — UI-only, fine).
- **Migration:** none needed for existing data (single-lease tenants unaffected).

### Risks
- Billing/notifications assume single unit in places; grep for `units.find` / `lease.tenantId` single-lookup sites.
- Attribution/broker commission logic keys off lease; verify no regression.

### Verification
- Integration test: tenant with 2 active leases sees both; switching updates payments/requests scoping.

---

## 4. Legacy `owner` role retirement (Phase 9 exit criteria) — ✅ DONE (code)

Delivered: `owner` removed from the `Role` type, `User` enum, `ASSIGNABLE_ROLES`
and the admin CLI (`2afb68a`, `42c517c`), and the `/dashboard/owner/**`
surface retired with redirects (`ae42be1`). Remaining work is data-only — see
the dead `role === "owner"` comparisons noted in
`docs/runbooks/role-management.md` §8.

**Current state:** `docs/plans/multi-admin-revamp-17-phase9-stabilisation.md` defines exit criteria. `audit:phase9` reports: 0 owner users, 1 legacy-owner property, 3 assignments. So data migration is mostly done; remaining work is code-level retirement of the `owner` role path.

**Goal:** Remove `owner` from the role enum, nav, RBAC, and routes, or formally deprecate with a sunset. (Decision needed: hard-remove vs. keep read-only legacy support.)

**Tier 2 triggers:** cross-service role contract change → `@principal-architect` + `@security-expert`. Invoke before implementation.

### Scope
- Audit all `role === "owner"` / `"owner"` string references (`grep -rn '"owner"' src`).
- Remove owner from `Role` type, `ASSIGNABLE_ROLES`, nav builders, dashboard routes (or redirect legacy).
- Update tests that reference owner role.
- Run `audit:phase9` to confirm 0 owners and document the retirement.

### Risks
- Hidden dependencies: any code path that assumes an owner exists (e.g., property ownership bootstrap). Audit carefully.

---

## Recommended order

1. **Broker nav** — done.
2. **Tasks persistence** — most self-contained; needs `@database-architect` + `@security-expert` rulings first.
3. **Multi-unit tenancy** — schema change; design before code.
4. **Legacy owner retirement** — largest blast radius; do last, after 2 & 3 ship.

## Conventions to follow
- `keja-yangu-conventions` skill: App Router routes, Mongoose models, zod schemas, RBAC guards, react-hook-form, Vitest.
- Verification gate for every item: `biome check .` (0 errors), `tsc --noEmit`, `vitest run`, `next build`, plus item-specific manual smoke.

## Open decisions (need user input)
- Tasks: migrate or discard existing localStorage tasks?
- Multi-unit: should a tenant be able to hold leases across different owners/properties, or only within one owner's portfolio?
- Legacy owner: hard-remove now, or keep read-only legacy support for one more release?