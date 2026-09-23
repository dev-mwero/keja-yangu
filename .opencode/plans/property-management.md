# Keja Yangu — Property Management (roles, privileges, CRUD)

## 1. Summary

Owners and a new `system-admin` role get full create/read/update/delete control over
properties and tenants. Caretakers are read-only by default and can be granted
granular privileges by the owner through a new team/caretaker settings page. Properties
migrate from the mock/localStorage dashboard pattern to the real MongoDB API
(`/api/v1/properties`), a new `Tenant` model + `/api/v1/tenants` API is added with a
management page, and owner/caretaker portfolio pages gain create/edit/delete dialogs
gated by role + privilege. Persistence is real (MongoDB), never localStorage.

## 2. Scope

### In scope
- Add `system-admin` role end-to-end (User model, client `Role`, dashboardNav, layout
  roleMap, auth redirects). Full control over properties/tenants/caretaker privileges.
- Caretaker privilege model stored on the `User` doc: `privileges: string[]` +
  `managedByOwnerId`. Privilege set: `create_property`, `edit_property`,
  `delete_assigned_property`, `manage_tenants`. Default = read-only.
- Owner-only team/caretaker settings page (`/dashboard/owner/team`) with a privilege
  switch per caretaker. system-admin gets an equivalent management surface.
- Property create/edit/delete dialogs inside owner + caretaker portfolio pages.
- New `Tenant` model + `/api/v1/tenants` + `[id]` CRUD + tenants management pages
  (owner; caretaker only with `manage_tenants`).
- Ownership attribution on caretaker-created properties (`ownerId := managedByOwnerId`,
  `createdById := creator`), stripping client-supplied identity fields.
- Extract reusable authz module `src/lib/permissions.ts` (`authenticate`,
  `requireRole`, `requirePermission`). Close the existing cross-owner mutation hole
  (PATCH/DELETE never checked `property.ownerId === user.userId`).
- New caretaker listing + privilege API (`GET/PUT`).
- Migration/backfill script, README + sitemap updates, tests.

### Out of scope
- Tenant self-onboarding, tenant login, or treating Tenants as `User` docs.
- Payments/invoices/tasks/announcements/documents — remain on the existing
  localStorage stores (`src/data/dashboard.ts`); only property + tenant flows go real.
- Public marketplace redesign; public pages keep browsing seed data.
- Multi-owner caretaker binding (a caretaker bound to exactly one owner in v1).
- User CRUD/impersonation for system-admin (flag for a future plan).
- Soft-delete / `isDeleted` flags (the zero-tenant-ref delete guard is the mechanism).
- Unit → `main` merges / deployment automation (handled outside this plan).

## 3. Architecture

```
Views (portfolio dialogs, team page, tenants pages)
   │  useProperties / useTenants / useCaretakers hooks (fetch + mutate + toast)
   ▼
API: /api/v1/properties(/:id)  /api/v1/tenants(/:id)  /api/v1/caretakers(/:id/privileges)
   │  each route: authenticate → requirePermission(action, resource) → DB op
   ▼
src/lib/permissions.ts  ── reads ──► src/models/User.ts (source of truth:
   can(user, action, {resource, ctx})        role, isActive, privileges, managedByOwnerId)
   │
   ▼
src/models/Property.ts (ownerId, caretakerIds, createdById)
src/models/Tenant.ts   (propertyId, ownerId denormalized, email, status)
```

**Data flow invariants**
- Every protected call loads the `User` doc from DB; JWT is identity only, never
  authorization. `isActive` is checked on every call.
- Caretaker-created property: `ownerId` = caretaker's `managedByOwnerId` (403 if
  orphan/missing/inactive/non-owner), `createdById` = caretaker's `userId`,
  creator is auto-appended to `caretakerIds`.
- system-admin property create must name an existing active `role === "owner"` target
  (400 if absent).
- Tenant writes denormalize `ownerId` from `Property.ownerId` at write time.
- Delete property is blocked (409) while any `Tenant.propertyId` references it.

**Permission decision table (authoritative)**

| Actor | create | edit | delete | manage tenants | read |
|---|---|---|---|---|---|
| owner | yes (`ownerId = createdById = self`) | own properties only | own, blocked if tenant-referenced | yes | own properties + tenants |
| system-admin | yes, must name active `role === "owner"` target | any (may re-parent) | any (409→tenant ref) | yes | all |
| caretaker `edit_property` | n/a | any property of managing owner, minus `ownerId`/`createdById`/`caretakerIds` (owner/admin-only fields) | n/a | n/a | assigned properties |
| caretaker `delete_assigned_property` | n/a | n/a | `caretakerIds` includes actor AND `ownerId === managedByOwnerId`, 409 if tenant-referenced, else 403 | n/a | assigned properties |
| caretaker `manage_tenants` | n/a | n/a | n/a | tenants on assigned properties with `ownerId === managedByOwnerId` | tenants in that scope |
| caretaker default | 403 | 403 | 403 | 403 | assigned properties only |
| anonymous | – | – | – | – | list + detail: `status === "available"` only, stripped public projection |

**Visibility rule:** out-of-scope **reads → 404** (hide existence, prevents PII
enumeration); out-of-scope **mutations on existing resources → 403** (covers the
literal "delete block of 403" the business requires). Absent/invalid id → 404/400.

## 4. What to do

1. **Role threading (`system-admin`)** — update `src/models/User.ts` (interface line 7
   + schema enum line 19), `src/hooks/use-auth.tsx` `Role` (line 7), 
   `src/config/dashboardNav.ts` `Role` (line 23), `src/app/dashboard/layout.tsx`
   roleMap (lines 7–11: add `"/dashboard/system-admin": ["system-admin"]` and grant
   `system-admin` on `/dashboard/owner` + `/dashboard/caretaker` paths), and
   `src/app/auth/page.tsx` `roleRoute` (`system-admin → /dashboard/system-admin`).
   **Do NOT** add `system-admin` to the public signup enum (`auth/route.ts:18`,
   `auth/page.tsx:28` stay 3-role) — it is invite/seed only.
2. **Identity + privileges in `/api/auth/me`** — response gains `{ id, privileges,
   managedByOwnerId }`; `KejaUser` in `use-auth.tsx` (lines 9–13) gains `id` +
   optional `privileges`/`managedByOwnerId`. This unblocks all privilege-gated UI and
   fixes the caretaker-identity-by-mock hack (see 10).
3. **`src/lib/permissions.ts` fallback-secret fix first** — before any authz work,
   replace `process.env.JWT_SECRET ?? "fallback-secret"` in `auth/route.ts:60`,
   `properties/route.ts:29`, `properties/[id]/route.ts:29`, `auth/me/route.ts:17`
   with fail-closed behavior when unset in production. This is a pre-existing bug and
   a token-forgery vector.
4. **Extract auth helpers** into `src/lib/permissions.ts`: `authenticate(request)`,
   `requireRole(request, roles)` (legacy shape), `requirePermission(request, action,
   { resource?, ctx? })` returning `NextResponse | null` so existing
   `if (authError) return authError;` style keeps working. Every protected call loads
   the User doc fresh (role, `isActive`, `privileges`, `managedByOwnerId`); JWT `role`
   claim ignored for authz. Action vocabulary: `property:create | property:edit |
   property:delete | tenant:manage`.
5. **Property routes** — POST: `requirePermission("property:create")`, server-derived
   `ownerId` per table, strip `ownerId` from `propertyInput` schema, validate
   `caretakerIds` refer to `role === "caretaker"` users, auto-append creator.
   PATCH/DELETE `[id]`: load doc first (404 absent, 400 invalid id), then
   `requirePermission("property:edit" | "property:delete", { resource })`. Caretaker
   edits cannot modify `ownerId`/`createdById`/`caretakerIds` (PATCH schema — strip,
   never reject-if-absent). GET: add optional `ownerId`, `caretakerId`, `status`
   filters; anonymous list/detail return only `status: "available"` with a public
   projection (no `ownerId`, `caretakerIds`, `createdById`).
6. **`src/models/Property.ts`** — add `createdById: string` (default `""`, consistent
   with `ownerId`). Keep `ownerId`/`caretakerIds` as plain 24-hex string ids.
7. **`src/models/User.ts`** — add `privileges: [{ enum of the 4, default [] }]` and
   `managedByOwnerId: string default ""`. Index `{ role: 1, managedByOwnerId: 1 }`.
8. **Caretaker/privileges API** — `GET /api/v1/caretakers?ownerId=` (owner sees
   `managedByOwnerId === self`, system-admin all, others 401/403) returning rows
   `{ id, name, email, managedByOwnerId, privileges, propertyCount }`;
   `PUT /api/v1/caretakers/[id]/privileges` with zod-validated privilege subset.
   Authorization: owner whose `userId === target.managedByOwnerId` (or a target with
   empty `managedByOwnerId`, binding atomically in the same write), or system-admin.
   Non-caretaker target → 400; caretaker bound to another owner → 409.
   `propertyCount` via one `$unwind + $group` aggregation over `Property.caretakerIds`.
9. **`src/models/Tenant.ts`** — `{ name (req, trim), email (req, trim, lowercase),
   phone?, propertyId (req string), ownerId (req, denormalized at write), status enum
   [active, pending, rejected] default "pending", joinedAt (Date, set on
   pending→active), notes?, timestamps }`. Compound unique `{ propertyId, email }`.
10. **Tenants API** — `GET/POST /api/v1/tenants` and `GET/PATCH/DELETE
    /api/v1/tenants/[id]`, all `requirePermission("tenant:manage")`. Scoping: owner by
    `Tenant.ownerId === self`; caretaker via `Property.find({caretakerIds: id})` ids →
    `Tenant.find({propertyId: {$in}})`, restricted to `ownerId === managedByOwnerId`;
    system-admin all. POST validates property exists (422 otherwise); checks
    property scope; derives `ownerId`. PATCH status transitions + property
    re-assignment scoped to the actor's managed properties. `.select` only safe
    fields (Tenant never has auth internals, but never echo anything beyond
    name/email/phone/propertyId/ownerId/status/joinedAt/notes/timestamps).
11. **Hooks layer** — extend `src/hooks/use-properties.tsx` to
    `createProperty/updateProperty/deleteProperty`; add `src/hooks/use-tenants.tsx`
    and `src/hooks/use-caretakers.tsx` following the same shape (fetch + mutate +
    toast + refetch/optimistic).
12. **Owner portfolio** (`src/app/dashboard/owner/portfolio/page.tsx`) — replace the
    "Add property" link-to-`/properties` (lines 56–61) with: create dialog (RHF + zod
    over `propertyInput`), edit dialog per property card (extend `PropertyCard` with
    an optional actions slot or wrap it), delete via `alert-dialog` (confirm →
    DELETE → toast → refetch). CaretakerIds input needs a custom chip/checkbox UI
    (no multi-select exists in the UI kit); images stay URL lists.
13. **Caretaker portfolio** — actions gated by privileges from `useAuth`: create
    button iff `create_property`; edit iff `edit_property`; delete iff
    `delete_assigned_property` AND the card's `caretakerIds` includes the user.
    Default = plain read-only cards. Stop resolving caretaker identity from
    `src/data/properties.ts` (line 39 `caretakers.find(... ?? "c1")`) — use `user.id`.
14. **Team page** (`src/app/dashboard/owner/team/page.tsx`) — `DashboardShell` + a
    table of caretakers (ui/table) with four `Switch` controls each initialized from
    `GET /api/v1/caretakers`, PUT on toggle, disable while in flight, revert + toast
    on failure. system-admin equivalent under its own nav.
15. **Tenants pages** — shared `TenantsManager` component consumed by
    `/dashboard/owner/tenants` and `/dashboard/caretaker/tenants` (caretaker page +
    nav entry shows only with `manage_tenants`; API enforces regardless). Status tab
    filters, property select, add/edit tenant dialog, delete AlertDialog.
16. **System-admin dashboard** — overview + portfolio (full CRUD, all properties) +
    tenants + caretakers under `/dashboard/system-admin/*`; reuse owner page
    components via `DashboardShell`.
17. **Nav config** — extend owner nav with `/tenants` + `/team`; caretaker nav with
    `/tenants` (rendered client-side only when privileged); systemAdminNav.
18. **Tests** — full matrix + route + component tests (section 10).
19. **README** (roles table lines 112–119, API table lines 64–73) + `src/app/sitemap.ts`
    update for the new routes/roles.
20. **Rate limit + Origin check** — mutating endpoints (`privileges` PUT/POST,
    tenants POST) get tight per-IP limits (e.g. 20/min) and a cheap Origin/
    Sec-Fetch-Site check; keep the existing rate-limit lib but only trust
    `x-forwarded-for` behind a proxy (document; fix the "unknown" fallback key).

## 5. What NOT to do

- **Do NOT add `system-admin` to public signup** (enum stays 3-role). Privilege
  escalation hole.
- **Do NOT trust the JWT `role` claim for authorization.** Re-read the User doc on
  every protected call. This also closes the 7-day "deactivated user keeps write
  access" hole.
- **Do NOT leave the fallback `?? "fallback-secret"`** anywhere once touched — 
  replace with fail-closed. Token forgery → instant system-admin.
- **Do NOT let caretakers mutate `ownerId`, `createdById`, or `caretakerIds` on
  PATCH.** Self-assignment would defeat `delete_assigned_property` gating.
- **Do NOT accept client-supplied `ownerId` on POST/PATCH** for owner/caretaker —
  server derives it. (PATCH currently passes parsed `ownerId` through untouched —
  that's a re-parenting hole.)
- **Do NOT cascade-delete tenants** when a property is deleted. Block (409) while
  tenant refs exist. Never orphan PII.
- **Do NOT return `ownerId`/`caretakerIds`/`createdById` to anonymous users** on the
  public property detail — identity disclosure.
- **Do NOT use ObjectId refs** for the id fields — keep 24-hex strings everywhere
  (`includes`/string-equality sites break on ObjectId strict equality; a hex string
  converts to ObjectId later for free).
- **Do NOT build a mongodb-memory-server suite** for this feature; model methods are
  mocked and zod is the validation surface.
- **Do NOT rewrite the unrelated smoke tests** (`rate-limit`, `email`, `use-auth`,
  `PropertyCard`, `auth`). Only upgrade `pagination.test.ts` (this feature needs it).
- **Do NOT add `isDeleted` soft-delete flags.** The zero-tenant-ref guard is the
  integrity mechanism; flags pollute every query.
- **Do NOT test `src/proxy.ts`** (custom middleware convention; out of scope).
- **Do NOT write `middleware.ts`** — this Next.js build uses `src/proxy.ts`; the
  existing cookie-presence guard already covers `/dashboard/system-admin`.
- **Do NOT re-verify security on every route separately** — centralize 404/403 in
  `requirePermission` so routes can't drift.
- **Do NOT remove `src/data/properties.ts` / `src/data/dashboard.ts`** — public
  marketing pages and out-of-scope stores still consume them.

## 6. Security considerations

### Controls required
- DB is the authz source of truth (`role`, `isActive`, `privileges`,
  `managedByOwnerId`) loaded per call; JWT = identity only (`userId`).
- 404 on out-of-scope reads; 403 on out-of-scope mutations on existing docs.
- Caretaker privileged actions all require a live bound owner (`managedByOwnerId`
  → exists, `role === "owner"`, `isActive`). Orphan/bound-to-deactivated-owner fails
  closed (403).
- Owner may grant privileges only to an unbound caretaker (409 if bound to another
  owner) or their own caretakers; grant atomically binds `managedByOwnerId`.
- Public reads: `status: "available"` filter + public projection (no identity refs).
- Scheme-boundary stripping of identity fields on caretaker writes.
- Don't deactivate → deactivated users are cut off within one request (DB read).
- Keep `bcryptjs` password policy; raise minimum password length to ≤... ≥ 8 is
  recommended (existing 6) as a follow-up, not blocking.
- Rate-limit privilege/tenant-write endpoints (20/min) + Origin/Sec-Fetch-Site check
  on mutating endpoints (belt-and-braces on SameSite=Lax + JSON-only).

### Forbidden shortcuts
- Never authorize by JWT role claim alone.
- Never allow caretaker-owned `ownerId` on create or re-parent on edit.
- Never expose tenant records to default caretakers (403/404, not read).
- Never log `passwordHash`, `verificationToken`, or full request bodies.

## 7. Performance considerations

- `requirePermission` = exactly one User `findById` per protected call (privileges are
  read from that same doc; no extra joins — this is why privileges live on User).
- Owner tenant list = one indexed `Tenant.ownerId` query; caretaker = two queries
  (`Property.find({caretakerIds})` then `Tenant.find({propertyId: {$in}})`). Fine at
  this scale; no denormalization beyond `Tenant.ownerId`.
- `propertyCount` = one `$unwind + $group` aggregation (no N+1 `countDocuments`).
- Indexes (lean): `User {role, managedByOwnerId}`, `Property {ownerId}`,
  `Property {caretakerIds}` (multikey), `Tenant {propertyId}`, `Tenant {ownerId}`,
  `Tenant {propertyId, email}` unique. `User.email` unique already exists.
  Deliberately NOT indexed: `Property.status` (no query yet), `User.privileges`
  (never queried by membership), `Property.createdById`.
- No fetch amplification in GETs: use `.select()` public projections once, reuse
  `parsePagination`/`buildPaginationResult` from `src/lib/pagination.ts`.
- Out of budget (not needed): Redis rate-limit store, query caching, pagination
  cursors. In-memory rate limiter per process is acceptable.

## 8. DevOps and observability

- No infra changes. Scripts stay `npm run dev / build / test / check`.
- New script: `scripts/backfill-property-management.ts` run via `npx tsx` (idempotent,
  see section 11). Not wired into CI — run manually as part of rollout.
- Env: no new vars. Required runtime truth: `MONGODB_URI`, `JWT_SECRET` (fail-closed
  when missing in prod). Log a startup warning if either is unset/fallback.
- Logging: minimal request-level audit on caretaker PATCH of properties and all
  deletes — at minimum `updatedBy`/`updatedAt` on the doc and a log line
  (actorId, action, resourceId, timestamp) for property deletes. No PII in logs.
- CI: `.github/workflows/ci.yml` already runs `next build` + lint + tests on dev and
  main. Ensure the test suite stays green offline (no Mongo) — mocked
  `connectToDatabase`; route tests assert `JWT_SECRET` is set to a test value and
  `MONGODB_URI` unset in a `beforeAll` guard.
- Coverage gates (add to `vitest.config.ts`, per-file): ≥80% lines / ≥75% branches on
  `src/lib/permissions.ts`, `src/lib/schemas/**`, and the six route modules. No global
  threshold (existing smoke tests would fail it).

## 9. Implementation tasks (ordered, assigned agent type)

Each task lands on `dev`; verify (`npm run check`, `npm run test`, `npm run build`)
after each grouping. Do NOT commit unless the user asks.

1. **`developer-fast`** — Fix fallback JWT secret fail-closed in the 4 route files
   (auth, auth/me, properties, properties/[id]).
2. **`developer-prime`** — Thread `system-admin` role end-to-end (User model,
   use-auth `Role`, dashboardNav roleMap/build, auth roleRoute, layout roleMap,
   sitemap). Keep signup enum 3-role. Update role-mapping tests.
3. **`developer-prime`** — `/api/auth/me` returns `id, privileges, managedByOwnerId`;
   `KejaUser` extended; fix caretaker-identity-by-email in caretaker pages.
4. **`developer-prime`** — `src/lib/permissions.ts` (authenticate / requireRole /
   requirePermission + action vocabulary + `can()`); User model gains
   `privileges`/`managedByOwnerId` + index; Property gains `createdById`.
5. **`developer-fast`** — Rework property routes (POST attribution, PATCH/DELETE
   scope checks + resource load, strip identity fields, caretakerIds validation &
   auto-append creator, public status filter + projection, optional filters).
6. **`developer-prime`** — Tenant model + `/api/v1/tenants` + `[id]` routes
   (scoping per table, property existence validation, ownerId denormalization,
   compound unique).
7. **`developer-prime`** — Caretaker/privileges API (GET list w/ propertyCount
   aggregation, PUT privileges w/ atomic binding, 409/400/401/403 rules).
8. **`developer-fast`** — Hooks: extend `use-properties` (mutations), add
   `use-tenants`, `use-caretakers`.
9. **`developer-prime`** — Owner portfolio dialogs (create/edit/delete) + extend
   `PropertyCard` actions slot + caretakerIds chip input.
10. **`developer-prime`** — Caretaker portfolio privilege-gated actions.
11. **`developer-prime`** — Team page + nav entries; shared `TenantsManager` +
    owner/caretaker tenants pages; `system-admin` dashboard shell.
12. **`developer-fast`** — Backfill script `scripts/backfill-property-management.ts`.
13. **`test-engineer`** — Implement the full test plan (section 10) in dependency
    order (utils → unit → routes → hooks → components).
14. **`developer-fast`** — README + sitemap cleanup.
15. **`developer-prime`** — Rate-limit + Origin check on privilege/tenant mutating
    endpoints; XFF-trust documentation.

## 10. Testing strategy

**Single source of truth:** `src/test/utils/permission-matrix.ts` — flat case array
`{ label, role, privileges, action, resourceState, expected }`. Iterated by the pure
`can()` unit test AND every route test (`test.each`). One matrix, two assertion layers.

**Matrix dimensions** — actors: owner, system-admin, caretaker profiles C0 (none),
C1 create, C2 editAny, C3 deleteAssigned, C4 manageTenants, C5 all, tenant,
unauthenticated. Resource states: Own, Foreign, Malformed id, Absent. Actions:
P·L/C/G/U/D, T·L/C/G/U/D, G·L/U. Expected codes per the section 4 table (owner 200s
scoped, system-admin universal, caretaker profile-gated + assignment-scoped,
anonym 401 / tenant 403, reads of foreign 404, mutations of foreign 403,
delete-blocked 409 with tenant refs).

**Unit tests**
- `src/lib/permissions.test.ts` — `can()` truth table for C0–C5 (16 cells),
  `normalizePrivileges` (unknown keys stripped, non-bools → false, garbage input →
  `{}`), `isFullControlRole` (owner + system-admin true).
- `src/lib/schemas/*.test.ts` — `propertyInput`/`propertyUpdate` (required fields,
  whitespace title, negative price, int beds, enum checks, caretaker strip of
  `ownerId`), `tenantInput`/`tenantUpdate` (ObjectId regex for propertyId, enum),
  `privilegeInput` (subset enum, missing caretakerId → fail).
- Upgrade `src/lib/pagination.test.ts` (clamping, boundary, empty).

**Route/integration tests** (files use `/** @vitest-environment node */`)
- New util `src/test/utils/api-request.ts` (real `jwt.sign` with `JWT_SECRET=
  "test-secret"`, NextRequest builder, async `params`), `model-mocks.ts`
  (chainable `find`/`findOneAndUpdate` mocks + factory), `factories.ts`
  (typed `makeProperty/makeTenant/makeUser` — Biome bans `as any`).
- `connectToDatabase` mocked no-op; Mongoose models are `vi.mock`'d objects.
- Properties: POST attribution (owner 201 `ownerId=node self`, caretaker C1 201
  `ownerId=managingOwner`, spoofed ownerId ignored, C0/C2/C3/C4 → 403, tenant/U
  401/403), GET scoping + pagination + anonymous available-only, PATCH scoping +
  `ownerId`/`createdById`/`caretakerIds` never mutated by caretaker, DELETE assigned
  lender 200 / unassigned 403 / tenant-ref 409.
- Tenants: POST scope (own property 201, foreign 403/404, C0 403, C4 in-scope 201),
  cross-owner tenant reads → 404, GET scoping for owner/admin/C4/C0.
- Caretakers/privileges: GET scope, PUT own-caretaker 200 / other-owner 403/409 /
  non-caretaker 400 / invalid shape 400 / revoked-all round-trip.
- Auth helper: expired/garbage/missing token → 401, wrong role → 403.

**Component tests** (`render-with-auth.tsx` util; per-file `vi.mock` of hooks + sonner)
- Create dialog: availability per role/privilege, zod errors on empty submit, payload
  correctness (no `ownerId` for caretaker), success closes + toasts, failure stays
  open, button disabled while pending.
- Edit dialog: prefill, PATCH payload, visibility C2 on in-scope / hidden on C0/C1/C3,
  delete dialog: confirm flow, cancel, C3-on-unassigned button hidden, owner delete.
- Privilege manager: caretaker list, four switches all-off default, toggle fires PUT
  with full normalized set, optimistic flip + revert on failure, disabled in flight,
  non-owner redirect, list-error state.
- TenantsManager: rooms list, loading/empty states, create/edit/delete flows, C4
  gating.
- Hooks: `use-tenants`, `use-caretakers` with mocked fetch.

**Out of scope to test:** `proxy.ts`, Mongoose internals / mongodb-memory-server,
Radix/portal/animation internals, `next/*` internals, static mock fixtures, full
branch coverage of every dialog, unrelated existing smoke tests.

**Verification commands:** `npm run check` (Biome), `npm run test` (Vitest),
`npm run build`.

## 11. Migration path

All steps additive and backward-compatible; models deploy before data.

1. **Schema changes** — User: `role` enum + `"system-admin"` (additive), new
   `privileges` (`default: []`) + `managedByOwnerId` (`default: ""`). Property:
   `createdById`. New `Tenant` model. Existing docs unaffected (defensive reads
   `privileges ?? []`).
2. **Indexes** — the section-7 set; build before backfill.
3. **Backfill caretakers** — `updateMany({ role: "caretaker", managedByOwnerId:
   { $exists: false } }, { $set: { managedByOwnerId: "", privileges: [] } })`.
   Required: the `{role, managedByOwnerId}` index can't match docs missing the field,
   so unbound caretakers would silently vanish from owner listings otherwise.
4. **Backfill properties** — pipeline update
   `updateMany({ createdById: { $exists: false } },
   [{ $set: { createdById: "$ownerId" } }])`.
5. **Seed a system-admin user** in the same script
   (`role: "system-admin"`, `isVerified: true`) — never via signup.
6. **Rollback** — no destructive changes; revert = restore code, leave additive
   fields (harmless defaults). No data destroyed.
7. **Test fixtures** — mock `"o1"/"c1"` ids are client-side only; real docs use
   24-hex strings, so the string id invariant holds in MongoDB.

## 12. Rollout plan

1. Land all tasks on `dev`; each grouping verified (`check`/`test`/`build`).
2. Manual QA on `dev` with a seeded owner + caretaker + system-admin:
   - caretaker default read-only; owner grants privileges; toggles reflect.
   - caretaker creates → property appears under owner portfolio (ownerId correct),
     `createdById`/`caretakerIds` set.
   - delete assigned vs unassigned (403 unassigned), delete with tenant → 409.
   - system-admin full CRUD + caretaker management.
3. Run backfill script once; verify caretaker listings + createdById.
4. Feature-flagging: not needed (additive role/fields; default read-only is the
   safe default). Deploy models+code together, then run backfill.
5. Merge/rollout to `main` follows the repo's normal dev→main procedure (as the user
   directs), then monitor: auth errors (401/403 spike → token/secret issue),
   delete-blocked 409s (expected), rate-limit hits.
6. Rollback triggers: elevated 4xx/5xx after deploy, auth outages, or any sign of
   the fallback-secret/forgery issue → revert code; data stays safe (additive).

## 13. Open questions (resolved → recorded)

All major ambiguities were adjudicated by architect/security/db consultants; final
stakes for the implementer:

- **Caretaker read scope** = assigned properties only (`caretakerIds`), not the
  whole owner portfolio. (Locked.)
- **edit-any vs delete-assigned asymmetry** = edit is portfolio-wide of the granting
  owner but may never touch `ownerId`/`createdById`/`caretakerIds`; delete requires
  assignment + owner-scope. (Locked.)
- **404 vs 403** = reads of foreign → 404, mutations of foreign existing → 403. (Locked.)
- **system-admin property create** must name an active `role === "owner"` target. (Locked.)
- **Orphan caretaker** (no valid bound owner) → 403 on all privileged actions. (Locked.)
- **Tenant email uniqueness** = compound `{propertyId, email}` (same person may rent
  two units). (Locked.)
- **Property delete with tenants** = 409, never cascade. (Locked.)
- **Privilege binding** = one owner per caretaker in v1; granting atomically binds;
  second owner → 409. (Locked.)
- **Remaining smaller decisions implementer may pick freely** (style-consistent):
  exact route path `/api/v1/caretakers/[id]/privileges` vs `/api/v1/privileges`;
  dialog component file organization under `src/components/portfolio` /
  `src/components/team` / `src/components/tenants`; slug `/dashboard/owner/team`
  — all must match between plan sections and tests.