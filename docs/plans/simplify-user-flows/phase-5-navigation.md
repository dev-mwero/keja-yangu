# Phase 5 — Navigation / IA consolidation

Part of [Simplify user flows](./README.md).
Status: **shipped** (`14d6df6`) · Depends on: Phase 4 (nice-to-have) · Risk: low

> **Goal:** the tenant dashboard reflects the simple mental model — *my home, my
> requests, my messages* — instead of 12 flat items. Owner/caretaker nav is left
> largely as-is (their mental model is portfolio-shaped and already reasonable).

## 1. Current behaviour

- `src/config/dashboardNav.ts` `tenantSections` (L112–125) = **12 items**:
  Overview · Browse homes (external `/properties`) · Vacant units · Applications ·
  Move Requests · Payments · Complaints · Chat · Announcements · Reports ·
  Documents · Settings. `tenantNav` (L127–131) maps them to `DashNavItem`;
  `tenantSubRoutes` (L133–135) exports the internal ones.
- There is **no `layout.tsx`**; each tenant page imports `tenantNav` and passes it to
  the shared shell (`nav={tenantNav}`), so the title/labels live in one config.
- Existing tenant pages: `page`, `applications`, `move-requests`, `payments`,
  `complaints`, `chat`, `announcements`, `reports`, `documents`, `settings`, `units`.

## 2. Target nav (12 → 8)

| # | Label | Route | Absorbs |
|---|---|---|---|
| 1 | Overview | `/dashboard/tenant` | Reports |
| 2 | Browse | `/properties` (external) | Vacant units |
| 3 | My Home | `/dashboard/tenant/home` | occupied unit + Complaints |
| 4 | Requests | `/dashboard/tenant/requests` | Applications + Move Requests |
| 5 | Payments | `/dashboard/tenant/payments` | — |
| 6 | Messages | `/dashboard/tenant/messages` | Chat + Announcements |
| 7 | Documents | `/dashboard/tenant/documents` | — |
| 8 | Settings | `/dashboard/tenant/settings` | — |

## 3. New / merged pages

- **`/dashboard/tenant/home` (My Home)** — the occupant's unit card (name, block,
  floor, rent, lease dates from the Phase 2/3 lease) plus their complaints and a
  "raise a complaint / request service" entry point. Reuses the existing unit +
  complaints views.
- **`/dashboard/tenant/requests`** — a tabbed page: *Applications* | *Move requests*,
  wrapping the existing `ApplicationsView` and the tenant move-requests view.
- **`/dashboard/tenant/messages`** — tabs: *Chat* | *Announcements*, wrapping the
  existing chat and announcements views.
- **Reports** folds into Overview (its cards already overlap the overview stats).

## 4. Redirects (no 404s)

Add to `next.config.ts` `redirects()` (use `permanent: false` initially, revisit
later), or keep the old page files as thin `redirect()` stubs. Recommended: config
redirects + delete the old pages, reusing their view components in the new pages.

| From | To |
|---|---|
| `/dashboard/tenant/units` | `/properties` |
| `/dashboard/tenant/applications` | `/dashboard/tenant/requests` |
| `/dashboard/tenant/move-requests` | `/dashboard/tenant/requests` |
| `/dashboard/tenant/complaints` | `/dashboard/tenant/home` |
| `/dashboard/tenant/chat` | `/dashboard/tenant/messages` |
| `/dashboard/tenant/announcements` | `/dashboard/tenant/messages` |
| `/dashboard/tenant/reports` | `/dashboard/tenant` |

## 5. Files changed

| File | Change |
|---|---|
| `src/config/dashboardNav.ts` | rewrite `tenantSections` to 8 items; keep `tenantSubRoutes` consistent |
| `next.config.ts` | add the redirect table |
| `src/app/dashboard/tenant/home/page.tsx` | NEW (My Home) |
| `src/app/dashboard/tenant/requests/page.tsx` | NEW (tabbed) |
| `src/app/dashboard/tenant/messages/page.tsx` | NEW (tabbed) |
| `src/app/dashboard/tenant/{units,applications,move-requests,complaints,chat,announcements,reports}/page.tsx` | delete (replaced by redirects + new pages) |
| tests | see §6 |

## 6. Tests

- `dashboardNav` unit test: `tenantNav` has **8** items with the expected
  labels/routes; the external Browse entry keeps `/properties`.
- A render test per new page (tabs switch, content present).
- A redirect assertion (or an e2e/smoke check) that each old URL resolves.

## 7. Acceptance criteria

1. The tenant nav has **8** items on desktop and mobile.
2. Every old tenant URL redirects — nothing 404s.
3. Every tenant function is reachable within **two** clicks of Overview.
4. No regression in owner/caretaker/system-admin nav.
5. Suite green; `tsc`, Biome, build clean.

## 8. Risks

- **Bookmarks / emailed links** to old routes → covered by 308/307 redirects.
- **Hard-coded route strings** in components/tests referencing removed pages → grep
  before deleting.
- **`tenantSubRoutes` consumers** (exported in `dashboardNav.ts`) must be updated to
  the new slugs if anything relies on it for guards/tests.
- **Mobile/desktop parity** — the shell renders the same `nav`, so both follow the
  config automatically.
