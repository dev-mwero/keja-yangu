# P3 — Hard removal of the legacy `owner` role

Follow-up to the soft deprecation in `feat/p4-owner-retirement` (merged). That
step blocked new owner assignments; this plan removes the role from the type
system, code paths, and tests entirely.

## Status

| # | Item | Status |
|---|---|---|
| 1 | Remove `owner` from `Role` type (permissions, role-management USER_ROLES, hooks, models, dashboardNav) | ✅ |
| 2 | Remove all `role === "owner"` code branches in API routes, libs, components | ✅ |
| 3 | Update tests (remove owner-specific cases, convert generic ones to admin) | ✅ |
| 4 | Remove owner dashboard route/nav or redirect to admin | ✅ — `/dashboard/owner/**` deleted; `ownerNav`, the `AuthGuard` admin→owner alias and the `role-routes` entry are gone, so `proxy.ts` now redirects those URLs to the visitor's own dashboard (`/dashboard/admin` for admins). Inbound links (search, chat, notifications, marketing page, sitemap) point at `/dashboard/admin`. |
| 5 | Verify: tsc, biome, vitest, next build | ✅ tsc + biome + vitest |

## Scope (from grep)

- **112 source references** to `"owner"` (excluding tests and chat/notification display labels).
- **39 `role === "owner"` branches** across API routes.
- **41 test failures** expected (owner-specific behavior tests).

## Key files

### Type system (remove "owner")
- `src/lib/permissions.ts` — `Role` union
- `src/lib/role-management.ts` — `USER_ROLES`
- `src/hooks/use-auth.tsx`, `src/hooks/use-users.tsx` — `Role` union
- `src/models/User.ts` — `role` field enum
- `src/config/dashboardNav.ts` — `Role` type + `ownerNav` export
- `src/lib/role-routes.ts` — `Role` type + `/dashboard/owner` entry

### Code paths (remove owner branches)
- `src/app/api/v1/` — 20+ routes with `role === "owner"` branches
- `src/lib/assignments.ts` — `principal.role === "owner" ? "admin" : ...`
- `src/lib/notifications.ts` — `role === "owner" || ...`
- `src/components/AuthGuard.tsx` — owner→admin access
- `src/components/chat/ChatInbox.tsx` — keep "owner" as chat label (landlord side)

### Tests (remove or convert)
- 14 test files with owner-specific cases (see grep results).

### Chat/notification labels (KEEP "owner")
- `MESSAGE_SENDER_ROLES`, `CHAT_AGENT_ROLES`, notification recipient role — these are display labels for the landlord side of chat, not user roles. Keep "owner" here for backward compat with existing data.

## Tier 2 triggers
- Cross-service role contract change → `@principal-architect` + `@security-expert`. Invoke before implementation.

## Risks
- Hard removal is a breaking change for any legacy owner users (none exist per audit).
- The `role-cutover.ts` and `legacy-readiness-report.ts` migration tools become obsolete but should be kept for historical data migration.
- The owner dashboard route (`/dashboard/owner`) should redirect to `/dashboard/admin` for any lingering bookmarks.

## Recommended approach
1. Invoke Tier 2 design agents first.
2. Remove "owner" from `Role` type.
3. Remove all owner code paths (systematic, file by file).
4. Remove owner-specific test cases (they test dead code).
5. Convert generic owner→admin tests.
6. Verify: tsc, biome, vitest, next build.

## Estimated effort
Large — 40+ source files, 41 test cases. Recommend a dedicated session.