# Phase 4 — Admin UX & Role Cutover

**Status:** Complete  
**Goal:** Make `admin` the primary operating management role and remove owner-only UI assumptions while maintaining backward compatibility.  
**Depends on:** Phase 3 complete (`feat/revamp`, commit `fd042b0`)

> [!IMPORTANT]
> Authorization boundary: Local code, test fixtures, and scripts only. No live production database mutations or deployments.

---

## 1. Objectives & Exit Criteria

### 1.1 Objectives
1. **First-Class Admin Dashboard Routing**:
   - Establish `/dashboard/admin` routes (or unified dashboard routes supporting `/dashboard/admin/*`), ensuring `admin` users land on their dedicated workspace.
   - Support `/dashboard/owner` seamlessly as a backwards-compatible alias (redirecting or rendering without session breakage).
   - Update `roleRoute` and edge proxy routing rules in `src/lib/role-routes.ts` and `src/proxy.ts` to allow `admin`, `owner` (alias), and `system-admin` across both `/dashboard/admin/*` and `/dashboard/owner/*`.
2. **Dashboard Navigation & UI Copy Normalization**:
   - Update navigation configuration (`src/config/dashboardNav.ts`) to provide `/dashboard/admin` base paths for admin navigation items.
   - Update platform navigation, headings, and role pills from "Owner" to "Admin" where referring to platform workspace operators (e.g., `SiteHeader.tsx`, breadcrumbs, dashboard summary cards).
   - Strictly preserve legal-owner semantics on invoices, leases, title deeds, and legal entity settings.
3. **Role Checks & Client Guards**:
   - Update `AuthGuard` (`src/components/AuthGuard.tsx`) and `use-auth` (`src/hooks/use-auth.tsx`) so `admin` is the primary operating role and `owner` is recognized as an alias during the compatibility window.
   - Ensure all staff components and dialogs (e.g. `PropertyDialog`, `UnitDialog`, `TeamManager`, `RecordPaymentDialog`) accept and display `admin`.
4. **Admin Onboarding & Scoped Assignment UI**:
   - Support inviting and creating `admin` accounts via team management endpoints (`/api/v1/caretakers`, `/api/v1/custodians`, `/api/v1/assignments`).
   - Provide UI views/modals for viewing and modifying staff `ManagementAssignment` records.
5. **Owner → Admin Data Cutover Script & Logic**:
   - Create pure migration planner in `src/lib/role-cutover.ts` with unit tests in `src/lib/role-cutover.test.ts`.
   - Create dry-run and apply script `scripts/cutover-owner-to-admin.ts` to batch update users from `role: "owner"` to `role: "admin"` with `migratedFromOwner: true`.
   - Log an `AuditEvent` for every transitioned user.
   - Provide rollback planning logic to safely reverse `migratedFromOwner: true` users back to `owner`.

### 1.2 Exit Criteria (from Multi-Admin Revamp Master Plan)
- [x] Admin can access and complete all property, unit, tenant, lease, invoice, and team management workflows under `/dashboard/admin`.
- [x] No dashboard or session regression for existing `owner` users or historical tokens.
- [x] Role transition planner and script validated with dry-run/apply modes and automated tests (`role-cutover.test.ts`).
- [x] Nested dashboard paths under `/dashboard/admin` and `/dashboard/owner` enforce the correct roles via `proxy.ts` and `role-routes.ts`.
- [x] New `admin` users can be invited and onboarded cleanly without `migratedFromOwner`.
- [x] All Vitest test suites (185 test files, 1,803 tests), TypeScript typecheck (`tsc --noEmit`), and Biome linting pass with zero errors.

---

## 2. Architecture & File Breakdown

### 2.1 Routing & Role Maps
- `src/lib/role-routes.ts`:
  - Update `roleRoute.admin` to `"/dashboard/admin"`.
  - Maintain `roleRoute.owner` as `"/dashboard/owner"` or alias to `"/dashboard/admin"`.
  - Add `["/dashboard/admin", ["admin", "owner", "system-admin"]]` to `dashboardRoles`.
- `src/proxy.ts` & `src/proxy.test.ts`:
  - Ensure edge gate allows both `admin` and `owner` to access `/dashboard/admin/*` and `/dashboard/owner/*`.
  - Handle transparent redirection or pass-through.
- `src/config/dashboardNav.ts` & `src/config/dashboardNav.test.ts`:
  - Add `adminNav` items pointing to `/dashboard/admin/*`.
  - Keep `ownerNav` mapped for legacy route compatibility.

### 2.2 Dashboard Route Pages (`src/app/dashboard/admin/`)
Create dashboard pages under `src/app/dashboard/admin/` mirroring the existing management layout:
- `src/app/dashboard/admin/page.tsx` — Admin dashboard home (KPIs, quick actions, portfolio summary).
- `src/app/dashboard/admin/layout.tsx` — Dashboard layout with sidebar navigation.
- Sub-routes mirroring owner capabilities or re-exporting shared feature views:
  - `portfolio/` (property & block listing, structure view)
  - `units/` (unit management & billing assignments)
  - `tenants/` (tenant management)
  - `accounting/` (invoicing, payments, billing accounts)
  - `team/` (staff & management assignments)
  - `communications/` (announcements, chat)
  - `applications/` & `move-requests/`
  - `settings/` & `notifications/`
*(Pages will reuse existing modular component views such as `PropertyManager`, `TenantsManager`, `UnitsManager`, `AccountingView`)*.

### 2.3 UI Components & Role Guards
- `src/components/SiteHeader.tsx`:
  - Update navigation links for role `admin` to `/dashboard/admin`.
- `src/components/AuthGuard.tsx` & `src/hooks/use-auth.tsx`:
  - Recognize `admin` and `owner` as equivalent operational roles for dashboard views.
- `src/components/team/`:
  - Update team invite dialogues to support inviting administrators with designated property/unit/billing scopes.

### 2.4 Role Cutover Service & Script
- `src/models/User.ts`:
  - Ensure `migratedFromOwner: { type: Boolean, default: false }` is tracked in schema and interface.
- `src/lib/role-cutover.ts`:
  - `planRoleCutover(input)`: pure planning function calculating eligible users, audit events to emit, and validation warnings.
  - `planRoleRollback(input)`: rollback plan for users with `migratedFromOwner: true`.
- `src/lib/role-cutover.test.ts`:
  - Unit tests verifying batch planning, audit trail creation, and rollback safety.
- `scripts/cutover-owner-to-admin.ts`:
  - CLI script with `--dry-run` and `--apply` flags.
  - Updates matching `User` records in configurable batch sizes.
  - Records `AuditEvent` with `action: "role.cutover"`, `actorId: "system"`, `details: { fromRole: "owner", toRole: "admin" }`.

---

## 3. Implementation Steps

1. **Routing Foundations**:
   - Update `src/lib/role-routes.ts` and `src/proxy.ts` to recognize `/dashboard/admin` and allow `admin` and `owner` interchangeably.
   - Add unit tests in `src/proxy.test.ts` and `src/lib/role-routes.test.ts`.
2. **Dashboard Navigation & Config**:
   - Configure `adminNav` in `src/config/dashboardNav.ts` and update `SiteHeader.tsx`.
   - Update `use-auth.test.tsx` and `AuthGuard.test.tsx`.
3. **Admin Dashboard Pages**:
   - Implement `src/app/dashboard/admin/` layout and route pages, wiring them to existing tested management components.
   - Ensure backwards compatibility of `/dashboard/owner/*` pages.
4. **User Schema & Cutover Planner**:
   - Add `migratedFromOwner?: boolean` to `User` model.
   - Implement `src/lib/role-cutover.ts` and test suite `src/lib/role-cutover.test.ts`.
   - Implement `scripts/cutover-owner-to-admin.ts`.
5. **Team & Assignment Management UI**:
   - Enhance team invitation and assignment components to support `admin` staff roles with explicit scope selections.
6. **Full Validation**:
   - Run typecheck, Biome checks, and full Vitest suite.
   - Verify zero regressions across all 184+ test files.

---

## 4. Verification & Testing

- `npm run typecheck`: must pass with 0 errors.
- `npm run lint` / `biome check`: must pass with 0 warnings/errors.
- `npm test -- --run`: all existing 1,792 tests plus new Phase 4 tests must pass.
- Role cutover planner tests verifying dry-run idempotence and rollback guarantees.

