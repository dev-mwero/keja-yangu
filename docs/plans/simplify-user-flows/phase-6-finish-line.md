# Finish-line: retire dead mechanisms & unify tenant requests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the simplify-user-flows programme (Phases 1–5, all shipped) by
retiring the dead `UnitPreference` mechanism, enforcing the "every lease names
an occupied unit" invariant, and merging the tenant Requests tabs into one
list — the last UI simplification the original plan left open.

**Architecture:** Small, surgical changes on top of the shipped allocation
service. (1) The manager's "requested unit" badge in the Tenants page currently
reads `UnitPreference` — a mechanism with **0 production documents and no UI
left** — so it must be re-pointed at pending move-in `MoveRequest`s before the
model is deleted. (2) `POST /api/v1/leases` keeps a legacy path that accepts a
lease with no `unitId` (lease-without-occupancy, divergence #2 of the original
plan §3.3); close it. (3) The tenant Requests page shows Applications and Move
requests as two separate tabs — the last "menu of overlapping ways" — merged
into one panel with one table.

**Tech Stack:** Next.js App Router route handlers, Mongoose, zod,
react-hook-form-free plain React hooks, Vitest (jsdom + model stubs).

**Spec:** `docs/plans/simplify-user-flows/README.md` (target flow §2, decisions
§8) and this document (scope decided 2026-10-18: leftovers **plus** the Requests
tab merge).

## Global Constraints

- Follow repo conventions: route handlers use `authenticate` /
  `requirePermission` from `src/lib/permissions.ts`; zod schemas live in
  `src/lib/schemas/`; tests use `getModelStubs()` from
  `src/test/utils/model-mocks.ts` wired through `vi.mock` factories.
- Run tests per file during development (`npx vitest run <file>`); run the full
  suite (`npx vitest run`) before each commit that ends a task.
- No new dependencies. No API shape changes beyond what each task names.
- Do not touch `src/lib/allocation.ts` — the allocation service is done.
- `MoveRequest.tenantId` is the **Tenant document `_id`**; `MoveRequest.unitId`
  is the Unit `_id`; statuses come from `MOVE_REQUEST_STATUSES`
  (`pending | approved | rejected | cancelled` — src/lib/domain-enums.ts:42).

## Review Focus

The five inputs most likely to break a real user, each pinned to a task:

1. **Tenants page select() tripwire** — `src/app/api/v1/tenants/route.test.ts`
   asserts an exact `select()` string; changing the `attachUnitHints` query
   without updating it fails loudly (Task 1).
2. **`Unit.findById` unstubbed in lease tests** — once `unitId` is required,
   every POST test reaching the occupancy check needs a stubbed occupied unit or
   the query chain hangs (Task 3 pins this with a 400-on-missing-unitId test and
   an updated success test).
3. **Tenant move-request scoping** — `GET /api/v1/move-requests` must return
   only the signed-in tenant's own requests (`requestedById`); the merged panel
   shows them next to the tenant's applications, so a scoping regression leaks
   other tenants' requests into a tenant's screen (Task 4 asserts one of each
   kind, tenant's own only, via the panel test).
4. **Applications fetched by email** — `useTenantApplications(user?.email)`
   keys the query on the auth email; the merged panel must keep passing it or
   the applications half silently empties (Task 4).
5. **Withdraw survives the merge** — a pending application's Withdraw action is
   the tenant's only way out of a request; losing it in the refactor strands
   users (Task 4 pins it with an explicit test).

---

### Task 1: Re-point the Tenants-page "requested unit" badge to MoveRequests

The badge at `src/components/tenants/TenantsManager.tsx:364` reads
`t.requestedUnit`, which `attachUnitHints` in `src/app/api/v1/tenants/route.ts`
populates from `UnitPreference` (L33–75). Nothing creates preferences anymore
(the Prefer UI was removed in Phase 2), so the badge is dead in practice. This
task makes it live again from pending move-in `MoveRequest`s. Task 2 then
deletes `UnitPreference` for good.

**Files:**
- Modify: `src/app/api/v1/tenants/route.ts:26-77` (`attachUnitHints`)
- Modify: `src/app/api/v1/tenants/route.test.ts` (mock wiring + new case)

**Interfaces:**
- Consumes: `MoveRequest` model (`{ tenantId, type, status, unitId }`);
  `Unit` model (`{ name, blockName, tenantId }`).
- Produces: response rows keep the exact shape
  `{ ...tenantRow, unit, requestedUnit }` where `requestedUnit` is
  `{ _id, name, blockName } | null` — `TenantsManager` and
  `use-tenants.tsx` types (`requestedUnit?: TenantUnitSummary | null`) are
  unchanged.

- [ ] **Step 1: Write the failing test**

In `src/app/api/v1/tenants/route.test.ts`, replace the
`vi.mock("@/models/UnitPreference", …)` line (L18) with a `vi.mock` of
`@/models/MoveRequest` wired to `getModelStubs().moverequest`. Add a case
within the existing GET describe block:

```
it("attaches requestedUnit from a pending move-in request", async () => {
  // tenantStub.find chain resolves one tenant: { _id: TENANT_ID, userId: USER_ID, ... }
  // moveRequestStub.find returns [{ tenantId: TENANT_ID, type: "move-in",
  //   status: "pending", unitId: UNIT_ID }] for any query (use a query builder
  //   whose .select() and .lean() resolve the array)
  // unitStub.find (second call, keyed on _id $in) returns [{ _id: UNIT_ID,
  //   name: "3A", blockName: "Block A", tenantId: "" }]
  // GET returns 200; expect(json.data[0].requestedUnit).toMatchObject({
  //   _id: UNIT_ID, name: "3A", blockName: "Block A" })
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/api/v1/tenants/route.test.ts`
Expected: FAIL — new case gets `requestedUnit: null` (old code still reads
`UnitPreference`, whose stub returns nothing).

- [ ] **Step 3: Rewrite the `UnitPreference` half of `attachUnitHints`**

In `src/app/api/v1/tenants/route.ts`: delete the `UnitPreference` import and
the `prefs` / `prefUnitIds` block (L33–40). Add in its place a query for the
tenants' pending move-ins:

```ts
const moveIns = await MoveRequest.find({
  tenantId: { $in: tenantObjectIds }, // rows' _id values, valid ObjectIds only
  type: "move-in",
  status: "pending",
  unitId: { $ne: "" },
}).select("tenantId unitId").lean();
```

Key the per-tenant map by `String(moveRequest.tenantId)` and keep the existing
`nameByUnitId` lookup so `requestedUnit` still resolves `name`/`blockName`
from the `Unit` query (which now only needs the occupied-unit `$or` clause plus
`_id: { $in: moveInUnitIds }`). Keep the returned row shape identical. Update
the `attachUnitHints` doc comment (L23–25) to say "currently-occupied unit and
the unit they most recently requested (pending move-in)".

Note: `attachUnitHints`'s generic currently extends `{ userId?: string }`;
widen it to `{ userId?: string; _id?: unknown }` and filter non-ObjectId `_id`
values the same way `userId` is filtered today. Rows without a usable `_id`
simply get no badge — same as today.

- [ ] **Step 4: Run the test to verify it passes (and the tripwire)**

Run: `npx vitest run src/app/api/v1/tenants/route.test.ts`
Expected: PASS, including the pre-existing exact-`select()` assertion — if it
fails, update its expected string to the new `.select("tenantId unitId")`
value (this is the only select change in the file; the unit query's select
string is unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/tenants/route.ts src/app/api/v1/tenants/route.test.ts
git commit -m "fix(tenants): derive requested unit from pending move-in requests"
```

---

### Task 2: Retire the UnitPreference mechanism

Dead in production (0 documents), dead in the UI ("Prefer" removed in Phase 2),
and now unread by the tenants route. Delete it end-to-end.

**Files:**
- Delete: `src/models/UnitPreference.ts`
- Delete: `src/app/api/v1/units/[id]/prefer/` (route + `route.test.ts`)
- Delete: `src/app/api/v1/tenant/unit-preferences/route.ts`
- Delete: `src/hooks/use-unit-preferences.tsx`
- Modify: `src/lib/permissions.ts` — remove `"unit:prefer"` from the action
  union (L35), the tenant-only check (L157), and the tenant allowed-list
  entry (L175)
- Modify: `src/test/utils/model-mocks.ts` — drop `"unitpreference"` from the
  union (L21) and the stub entry (L41)
- Modify: `src/hooks/use-tenants.tsx:28` — comment says "marked as preferred";
  reword to "the unit they requested (pending move-in)"

**Interfaces:**
- Consumes: Task 1 (tenants route no longer imports `UnitPreference`).
- Produces: no API changes — `PUT/DELETE /units/[id]/prefer` and
  `GET /tenant/unit-preferences` cease to exist; their only consumer (the old
  Prefer button) was already removed.

- [ ] **Step 1: Delete the files and references**

Delete the four files/directories listed; remove the permissions and
model-mock entries; fix the comment. Then verify nothing else references the
mechanism:

Run: `grep -rn "UnitPreference\|unit:prefer\|unit-preferences\|use-unit-preferences" src --include=*.ts --include=*.tsx`
Expected: no output.

- [ ] **Step 2: Run type-check and the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 errors; all tests PASS (the deleted route's test file is gone;
nothing else mocked `UnitPreference` after Task 1).

- [ ] **Step 3: Commit**

```bash
git add -A src/models/UnitPreference.ts src/app/api/v1/units src/app/api/v1/tenant \
  src/hooks src/lib/permissions.ts src/test/utils/model-mocks.ts
git commit -m "refactor(units): retire the unused unit-preference mechanism"
```

---

### Task 3: Require every lease to name an occupied unit

`POST /api/v1/leases` still accepts a lease with no `unitId` ("legacy
billing-only path", `src/app/api/v1/leases/route.ts:105`). A lease without a
unit is exactly the occupancy/lease divergence the programme set out to
prevent, and nothing in the UI calls this endpoint today (`createLease` in
`src/hooks/use-leases.tsx` has no caller), so hardening it costs no users.

**Files:**
- Modify: `src/lib/schemas/lease.ts:8` — `unitId` from `.optional()` to
  required: `z.string().regex(hex24)`
- Modify: `src/app/api/v1/leases/route.ts:103-121` — delete the `if (unitId)`
  conditional: run the property-match + occupancy checks unconditionally and
  create the lease with `unitId` always set
- Modify: `src/app/api/v1/leases/route.test.ts`

**Interfaces:**
- Consumes: `Unit` model query (`findById(unitId).select("status tenantId
  ownerId propertyId")`) — unchanged.
- Produces: `POST /api/v1/leases` 400 when `unitId` is missing; 409 when the
  named unit is not occupied by the requesting tenant. `PATCH/GET/DELETE
  /api/v1/leases/[id]` untouched.

- [ ] **Step 1: Write the failing test**

In `src/app/api/v1/leases/route.test.ts`, inside the `POST /api/v1/leases`
describe:

```
it("400 when unitId is missing", async () => {
  // body: LEASE_INPUT without unitId, valid owner token, origin ok
  // expect(res.status).toBe(400)
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/app/api/v1/leases/route.test.ts -t "400 when unitId is missing"`
Expected: FAIL — route currently accepts the legacy path (returns non-400).

- [ ] **Step 3: Make `unitId` required in schema and route**

Apply the two file changes above. Keep the existing 409s
("Unit not found" → 404, "Tenant does not occupy this unit" → 409) exactly as
written; they simply now run for every request.

- [ ] **Step 4: Update the existing POST tests**

In `src/app/api/v1/leases/route.test.ts`:
- Add `unitId: UNIT_ID` to `LEASE_INPUT` (L36–42).
- In every POST case that reaches the occupancy check (the 404 property, 403
  owner-mismatch, 400 tenant-not-found, 400 wrong-property, 409 duplicate-lease,
  201 success at L300, and 429 rate-limit cases), stub
  `unitStub.findById` (exported from the same model-stub helper the file uses
  for `Unit` elsewhere — wire `vi.mock("@/models/Unit", …)` if not already
  present in this file) to resolve an occupied unit:
  `makeUnit({ _id: UNIT_ID, propertyId: PROPERTY_ID, status: "occupied",
  tenantId: <tenant's userId> })`. Note the route compares
  `unit.tenantId !== tenant.userId || ""` — the `makeTenant` factory must carry
  a `userId` matching the unit stub in the 201 case.
- The existing 409 "tenant does not occupy the specified unit" test (L334)
  needs no change.

Run: `npx vitest run src/app/api/v1/leases/route.test.ts`
Expected: all PASS.

- [ ] **Step 5: Run the full suite and commit**

Run: `npx vitest run`
Expected: PASS.

```bash
git add src/lib/schemas/lease.ts src/app/api/v1/leases
git commit -m "fix(leases): require POST leases to name a unit the tenant occupies"
```

---

### Task 4: Merge the tenant Requests tabs into one list

The tenant Requests page (`src/app/dashboard/tenant/requests/page.tsx`) shows
two tabs — Applications and Move requests — two tables for one concept ("things
I asked my manager for"). Merge into a single panel: request action cards on
top, one unified table below.

**Files:**
- Create: `src/components/tenant/TenantRequestsPanel.tsx`
- Modify: `src/app/dashboard/tenant/requests/page.tsx` (drop Tabs, render the
  new panel; subtitle → "Everything you've asked your property manager for.")
- Delete: `src/components/tenant/TenantApplicationsPanel.tsx`,
  `src/components/tenant/TenantMoveRequestsPanel.tsx`
- Test: `src/app/dashboard/tenant/requests/page.test.tsx` (rewrite)

**Interfaces:**
- Consumes:
  - `useTenantApplications(user?.email)` from `src/hooks/use-applications.tsx`
    — rows `{ id, propertyId, propertyTitle, unitName, applicantName, status,
    submittedAt, decidedAt }`; mutations `{ withdraw, pending }` via
    `useApplicationMutations`.
  - `useMoveRequests()` / `useMoveRequestMutations()` from
    `src/hooks/use-move-requests.tsx` — rows `{ _id, type, status, note,
    decisionNote, requestedDate, unitName, blockName }`;
    `{ create, pending }`.
  - `useMyTenancy()`, `useUnits({ propertyId })` — for the action cards
    (moved verbatim from `TenantMoveRequestsPanel`).
  - `useAuth()` for `user?.email`.
- Produces: `export function TenantRequestsPanel()` — no props. Internal row
  shape (not exported):

```ts
type UnifiedRow = {
  id: string;
  kind: "application" | "move-in" | "move-out";
  detail: string;      // propertyTitle, or "Unit 3A · Block A" for moves
  unitLabel: string;   // "Unit 3A" or ""
  status: "pending" | "approved" | "rejected" | "cancelled";
  submittedAt?: string;
  note: string;
  decisionNote: string;
  withdraw?: { id: string; title: string }; // only for pending applications
};
```

Merge rule: `application` rows map `detail = propertyTitle`,
`unitLabel = unitName ? \`Unit ${unitName}\` : ""`, `submittedAt = a.submittedAt`;
`move-*` rows map `detail = mr.unitName ? \`${mr.unitName} · ${mr.blockName}\` : mr.type`,
`unitLabel = mr.unitName ? \`Unit ${mr.unitName}\` : ""`,
`submittedAt = mr.requestedDate`. Sort by `submittedAt` descending.

Layout (top → bottom): three `StatCard`s (**Total requests**, **Pending**,
**Approved** — computed across both sources); the two action cards from
`TenantMoveRequestsPanel` (move-out / move-in) verbatim; filter `TabsList`
(**All / Pending / Approved / Rejected / Cancelled**) + existing `SearchInput`
(query matches `detail`, `unitLabel`, `status`, `note`) + the "Apply for a
home" `Button asChild Link href="/properties"`; one `Table` with columns
**Request · Detail · Submitted · Status · Note · Action**, where Action shows
the Withdraw button for `withdraw`-bearing rows and `Decided {date}` otherwise
for decided rows.

- [ ] **Step 1: Rewrite the page test as the panel's test**

Replace `src/app/dashboard/tenant/requests/page.test.tsx` content with cases
(mock `use-applications`, `use-move-requests`, `use-my-tenancy`, `use-units`,
`use-auth` the way the current file mocks them):

1. `it("lists applications and move requests in one table")` — feed one
   pending application and one pending move-in; expect **one** table body
   containing both `propertyTitle` text and the move's unit text; expect no
   elements with `role="tab"` named "Applications"/"Move requests".
2. `it("offers withdraw for a pending application")` — expect a button named
   "Withdraw"; clicking it calls the withdraw mutation with the application id.
3. `it("shows the request action cards")` — with a tenancy and one available
   unit, expect "Request a move-out" and "Request move-in" buttons.
4. `it("filters by status")` — feed one approved move-out and one pending
   application; click the "Pending" tab; expect the application row present and
   the move-out row absent.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/app/dashboard/tenant/requests/page.test.tsx`
Expected: FAIL — component doesn't exist / page still renders old tabs.

- [ ] **Step 3: Build `TenantRequestsPanel` and slim the page**

Create the panel per the Interfaces block (structure it on the two existing
panels: stat cards + filter/search from `TenantApplicationsPanel`, action
cards + create mutations from `TenantMoveRequestsPanel`). Rewrite
`page.tsx` to render `<DashboardShell … title="Requests" subtitle="Everything
you've asked your property manager for."><TenantRequestsPanel /></DashboardShell>`
— no `useState`, no `Tabs` import. Delete the two old panels.

- [ ] **Step 4: Run the test and full suite**

Run: `npx vitest run src/app/dashboard/tenant/requests/page.test.tsx && npx vitest run`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/tenant/requests src/components/tenant
git commit -m "refactor(tenant): unify applications and move requests into one list"
```

---

### Task 5: Record the decisions and close the plan in docs

The programme was built but its specs still say "PROPOSAL — pending decisions
D1–D4". Record what was decided and shipped so the docs match the code.

**Files:**
- Modify: `docs/plans/simplify-user-flows/README.md`
- Modify: `docs/plans/simplify-user-flows/phase-*.md` (5 files, status lines)

- [ ] **Step 1: Update the README**

- L3 `Status: PROPOSAL — pending decisions D1–D4` →
  `Status: **IMPLEMENTED** — Phases 1–5 shipped; see phase-6-finish-line.md for closing work`
- Add a "## 9. Decisions (resolved 2026-10-18)" section recording:
  - **D1 = Option A** — `Application` + `unitId` is the join-flow request;
    `MoveRequest` retained for tenant transfers/move-outs only.
  - **D2 = Option A** — `Lease` (with `unitId`) authoritative; `Unit.status` is
    the derived cache written only by `src/lib/allocation.ts`.
  - **D3 = all five phases** built sequentially (commits `031f7c0`, `400d5ba`,
    `ddc21e1`, `766b801`, `14d6df6`).
  - **D4 = proceeded** without the mandated architect review (tier unfunded);
    concurrency covered by atomic claims + `allocation.test.ts`.
- Update the §6 phase table: statuses → **shipped** with commit hashes.
- §3.4/§5.1: mark `UnitPreference` retired (closing commit of this plan).

- [ ] **Step 2: Update the five phase spec status lines**

Each `phase-N-*.md` L4 `Status:` → `**shipped** (commit <hash>)`, and
`phase-4` §9 note that `ChatThread.unitId` stayed deferred.

- [ ] **Step 3: Commit**

```bash
git add docs/plans/simplify-user-flows
git commit -m "docs(flows): record resolved decisions and mark phases shipped"
```

---

## Self-review notes

- Spec coverage: every residual from the 2026-10-18 audit (dead
  `UnitPreference`, stale badge, legacy lease path, unmerged tabs, stale docs)
  maps to exactly one task.
- `ChatThread.unitId` stays **deferred** (was an optional follow-on in the
  Phase 4 spec §9; messaging isn't in the target-flow statement).
- POST `/leases` hardening deliberately does not touch `PATCH /leases/[id]`
  (billing-term edits don't change occupancy).
