# Keja Yangu — Dashboard sub-pages build plan

## Goal

Replace all 22 placeholder dashboard sub-pages with working, styled, interactive
pages for the three roles (tenant, caretaker, owner). Each page is built, verified,
and committed as its own step on `dev`, then merged to `main` and pushed to both
branches (`origin` is the only remote; "both" = `dev` + `main`).

## Current state

- Overview pages already built: `/dashboard/tenant`, `/dashboard/caretaker`,
  `/dashboard/owner` (caretaker/owner use seeded mock data, local approve/reject state).
- Data layer available today:
  - `useProperties()` → GET `/api/v1/properties` (Mongo; JWT cookie auth).
  - `useTenantApplications()` / `src/lib/applications.ts` → localStorage + change events.
  - Mock `caretakers`, `tenants` in `src/data/properties.ts`.
- Placeholder pages: `src/app/dashboard/*/{applications,payments,complaints,chat,announcements,documents,reports,settings,tasks,portfolio,accounting,communications}/page.tsx` — each currently just `PlaceholderPage`.
- Shared UI: `DashboardShell` (`roleName`, `nav`, `title`, `subtitle`, children),
  `StatCard`, `PlaceholderPage`, UI kit (`button`, `badge`, `table`, `tabs`, `select`,
  `dialog`, `switch`, `slider`, `textarea`, `input`, `sonner` toasts, `label`, `tooltip`).
- Nav config in `src/config/dashboardNav.ts` (`tenantNav`, `caretakerNav`, `ownerNav`).

## Architecture for the new pages

Reuse the exact localStorage pattern that already works for applications, so every
page is functional without new server work:

1. `src/lib/local-store.ts` — generic typed localStorage collection:
   `readCollection<T>(key)`, `writeCollection<T>(key, items)`, `subscribeCollection(key, cb)`
   (dispatches `keja-store:<key>:changed` + listens to `storage`).
2. `src/hooks/use-local-store.tsx` — client hook `useLocalStore<T>(key, seed)` exposing
   `items`, `setItems`, `addItem`, `updateItem(id, patch)`, `removeItem(id)`.
   `"use client"`; identical shape to existing `useTenantApplications`.
3. `src/data/dashboard.ts` — typed demo seeds + domain types shared by the pages:
   `Payment`, `Invoice`, `Complaint`, `ChatThread`/`ChatMessage`, `Announcement`,
   `DashboardDocument`, `MaintenanceTask`, `ReportSummary` data, `ContactThread`,
   `UserSettings`.
   Seeds reference real seeded property titles / mock tenants so pages look alive.

Cross-role link (nice demo): owner/communications writes announcements to
`keja-store:dashboard-announcements` and tenant/announcements reads the same key
(falls back to a seeded list when empty).

UTC-ISO dates everywhere (`new Date().toISOString()`), matching existing pages.
Formatting helpers (`formatDate`, `formatKES`) are small local functions per page,
following the existing pattern in `src/app/dashboard/tenant/page.tsx`.

## Git workflow (repeat after EVERY step)

1. Implement + verify (see Verification).
2. Commit on `dev`: `git add <files>` → conventional message.
3. `git checkout main` → `git merge dev -m "chore: merge branch dev into main"`.
4. `git push origin main` → `git push origin dev`.
5. `git checkout dev`.

Scratch files `AGENTS.md`, `CLAUDE.md`, `scripts/test-email.cjs` stay untracked — never staged.

## Steps

| # | Page (`src/app/dashboard/...`) | Commit message | Notes |
|---|-------------------------------|----------------|-------|
| 0 | foundation: `lib/local-store.ts`, `hooks/use-local-store.tsx`, `data/dashboard.ts` | `feat(dashboard): add local store, hook and demo seed data` | Prereq for all pages. |
| 1 | `tenant/applications/page.tsx` | `feat(dashboard-tenant): build applications page` | Uses `useTenantApplications` + `cancelApplication`; status badges; CTA to `/properties`. |
| 2 | `tenant/payments/page.tsx` | `feat(dashboard-tenant): build payments page` | Tabs Upcoming/History/Auto-pay; balance StatCards; "Make payment" dialog writes to store; seeded from `Payment` seed. |
| 3 | `tenant/complaints/page.tsx` | `feat(dashboard-tenant): build complaints page` | Status filter tabs; "Log a complaint" dialog (textarea + priority) writes to store. |
| 4 | `tenant/chat/page.tsx` | `feat(dashboard-tenant): build chat page` | Thread list + messages panel; composer appends to store. |
| 5 | `tenant/announcements/page.tsx` | `feat(dashboard-tenant): build announcements page` | Reads `keja-store:dashboard-announcements` (owner-written) with seeded fallback; new-badge for recent ones. |
| 6 | `tenant/reports/page.tsx` | `feat(dashboard-tenant): build reports page` | Aggregates applications + payments + complaints (local stores); date range inputs; "Export JSON" download. |
| 7 | `tenant/documents/page.tsx` | `feat(dashboard-tenant): build documents page` | Lease/invoice/utility docs table from store; download (blob) + upload placeholder. |
| 8 | `tenant/settings/page.tsx` | `feat(dashboard-tenant): build settings page` | Profile from auth; notifications toggles + language select persisted in `UserSettings`; password-reset link. |
| 9 | `caretaker/tasks/page.tsx` | `feat(dashboard-caretaker): build tasks and maintenance page` | Task board (Open/Done tabs), create-task dialog (property select from `useProperties`, priority, due date), complete action. |
| 10 | `caretaker/portfolio/page.tsx` | `feat(dashboard-caretaker): build portfolio page` | Properties filtered by `caretakerIds`; per-property occupancy + status; StatCards. |
| 11 | `caretaker/accounting/page.tsx` | `feat(dashboard-caretaker): build accounting page` | Outstanding/Collected tabs from invoice store; "Record payment" dialog; totals. |
| 12 | `caretaker/documents/page.tsx` | `feat(dashboard-caretaker): build tenant documents page` | Tenant docs from mock `tenants`; status chips; upload placeholder. |
| 13 | `caretaker/communications/page.tsx` | `feat(dashboard-caretaker): build communications page` | Contact threads from mock tenants; composer replies persist to store. |
| 14 | `caretaker/reports/page.tsx` | `feat(dashboard-caretaker): build reports page` | Tasks/requests summary + occupancy; date range; export JSON. |
| 15 | `caretaker/settings/page.tsx` | `feat(dashboard-caretaker): build settings page` | Profile + preferences (persisted); password-reset link. |
| 16 | `owner/portfolio/page.tsx` | `feat(dashboard-owner): build portfolio page` | All properties from `useProperties`; status filter tabs; occupancy/units StatCards; add link → `/properties`. |
| 17 | `owner/tasks/page.tsx` | `feat(dashboard-owner): build tasks and maintenance page` | Aggregated maintenance tasks; priority badges; mark-complete persists. |
| 18 | `owner/accounting/page.tsx` | `feat(dashboard-owner): build accounting page` | Revenue snapshot + invoice statuses; StatCards (rent collected/pending); record payment. |
| 19 | `owner/documents/page.tsx` | `feat(dashboard-owner): build tenant documents page` | Docs across properties; download + upload placeholder. |
| 20 | `owner/communications/page.tsx` | `feat(dashboard-owner): build communications page` | Broadcast announcements composer → writes `keja-store:dashboard-announcements`; scheduled/readout list. |
| 21 | `owner/reports/page.tsx` | `feat(dashboard-owner): build reports page` | Revenue/occupancy aggregation; export JSON/print. |
| 22 | `owner/settings/page.tsx` | `feat(dashboard-owner): build settings page` | Profile + preferences; tenant-management links. |

## Verification (per step)

- `npx tsc --noEmit --incremental false` must pass with no new errors.
- `npx biome check` on the changed files only — must not introduce new errors; format
  new/edited lines to the file's existing style without touching unrelated drift.
- Sanity: page structure mirrors existing pages (`DashboardShell` + `nav`, `StatCard`s,
  tables/dialogs, sonner `toast` feedback on mutations).
- After a role's pages are done, spot-check in the browser via agent-browser
  (dev server on `http://localhost:3000`); property data needs Mongo running.

## Out of scope

- Real server persistence/APIs for payments/complaints/tasks (local-first like applications).
- Fixing Gmail email delivery (SMTP accepts, delivery broken at host) — unrelated.
- Pre-existing unrelated failures: `pagination.test.ts`, known biome drift in
  `email.ts`, `rate-limit*.ts`, `use-toast.ts`, `use-auth.tsx`, `PlaceholderPage.tsx`.