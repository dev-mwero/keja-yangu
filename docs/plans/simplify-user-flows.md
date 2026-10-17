# Simplify user flows

Status: **PROPOSAL — pending decision** (Phase 1 is implementation-ready)
Branch: `feature/simplify-user-flows`
Author: Orchestrix (inline)
Date: 2026-10-17
Updated: 2026-10-17 (added live-DB snapshot + Phase 1 build spec)

> Note: produced with the multi-agent tier unavailable ("Insufficient account
> funds"). A cross-system data-contract change like this would normally get a
> Tier 1 deep-dive plus a `@principal-architect` ruling. The target model below is
> a **proposal for decision**, not a ruling — **except Phase 1 (§6), which is
> additive and safe to build without a ruling.**

## 1. The question

> "Why do I feel every user flow is over-complicated? Have we over-engineered this?"

**Answer: yes — not everywhere, but at the exact steps that matter most.** The
product has grown several *parallel mechanisms that each solve the same lifecycle
step* (get a person into a unit), plus request records that are not anchored to
the unit. The intended flow is simple; the implementation offers the user a menu
of overlapping ways to achieve the same thing.

## 2. The target flow (restated)

```
PROSPECT   browse properties → pick one → see vacant units → request a unit
MANAGER    sees the request → accept / reject
ACCEPTED   ⇒ tenant is allocated that unit (moved in)
OCCUPANT   sees unit details · complains · requests service · contacts manager
           → every request is tied to the occupied unit
MANAGER    bills the tenant
```

## 3. Evidence: where today's code diverges

### 3.1 A prospect cannot pick a unit
- `src/models/Application.ts` has **no `unitId`** (fields L15–25; indexes L30–37).
- `src/app/properties/[id]/page.tsx` renders a property + an "Apply for this home"
  dialog (`handleApply` L81, button L304–316). **No vacant-unit list, no unit choice.**
- Result: the prospect requests a *property*; the unit is decided later, out of band.

### 3.2 Getting into a unit has FOUR paths
| # | Path | File | Effect |
|---|------|------|--------|
| 1 | Approve a move-in request | `src/app/api/v1/move-requests/[id]/route.ts` `applyMoveIn` | occupies unit + lease |
| 2 | Assign unit from Tenants page | `src/lib/tenancy.ts` `assignUnitToTenant` | occupies unit + lease |
| 3 | `PATCH /units/[id]` with `tenantId` | `src/app/api/v1/units/[id]/route.ts:92` | occupies unit (no lease guarantee) |
| 4 | `POST /api/v1/leases` | `src/app/api/v1/leases/route.ts:103` | lease (no occupancy guarantee) |

Paths 3 and 4 can leave **occupancy and lease out of sync**.

### 3.3 Two sources of truth for occupancy
- `Unit.tenantId` + `Unit.status` (stores a **userId**, with a legacy fallback to a
  **Tenant document id** — see `src/lib/tenancy.ts` vacate L148).
- `Lease` (unique partial `{ tenantId }` where `status:"active"`).
- Nothing guarantees they agree; four writers make divergence likely.

### 3.4 Two tenant "I want a unit" mechanisms, three UIs
- **`UnitPreference`** ("Prefer") — passive wish (0 documents in production).
- **`MoveRequest` type `move-in`** — the real request; approvable.
- Request UI appears in **both** `src/components/units/TenantUnitsView.tsx`
  ("Request this unit" + "Prefer") and
  `src/app/dashboard/tenant/move-requests/page.tsx` ("Request a move-in").

### 3.5 Tenancy is created in five+ ways
`POST /api/v1/tenants`, application approval `admitApprovedApplicant`
(`src/app/api/v1/applications/[id]/route.ts`), move-request email heal
(`src/app/api/v1/move-requests/route.ts` L119–132), plus three backfill scripts.

### 3.6 Occupant requests are NOT unit-scoped
- `src/models/Complaint.ts` has **no `unitId`**; the POST handler resolves the
  tenant by `userId` and derives `propertyId` (`src/app/api/v1/complaints/route.ts`
  L88–122). So a complaint cannot say "the leak in **unit 3A**".

### 3.7 No public way to list vacant units
- `GET /api/v1/units` (`src/app/api/v1/units/route.ts` L11–14) **requires auth**,
  and tenants are scoped to properties they already tenancy (L39–50) — a prospect
  with no tenancy gets `[]`. So even *showing* vacant units publicly needs new work.

### 3.8 Surface area
- Tenant nav = **12 items** (`src/config/dashboardNav.ts` `tenantSections`).
- **60** API route files, **18** models.

## 4. Live production snapshot (read-only audit, 2026-10-17)

The over-engineering is **structural, not accumulated data**. Production is
almost empty, so there is *no existing divergence to clean up* — the redesign is
about preventing it and simplifying the code surface.

| Collection | Count | Notes |
|---|---|---|
| users | 8 | tenant 4 · owner 3 · caretaker 2 |
| properties | 4 | **2 published** |
| units | 18 | **17 available · 1 occupied** |
| tenants | 2 | both `active`; **1 unlinked (`userId:"")** |
| leases | 1 | 1 `active` |
| applications | 1 | 1 `approved` |
| moverequests | 1 | 1 `move-in`, `approved` |
| unitpreferences | **0** | mechanism unused in production |
| complaints | 0 | — |

**Occupancy/lease divergence = 0.** The single occupied unit is matched to a real
userId **and** has an active lease; no orphan `tenantId`s; no lease without
occupancy; no occupancy without a lease.

Implications:
- **Phase 2–5 are preventive/structural, not data-cleanup.** Migration risk is
  near-zero; the cost is code surface + UX, not data.
- `UnitPreference` is a **dead mechanism** in production → safe candidate to retire (D1).
- The one legacy risk that *does* exist is the **1 unlinked tenant**
  (`userId:""`) — a real person who will need binding when they next sign in.

## 5. Proposed target model (for decision)

### 5.1 One request object
Make **one** request record that starts at the unit: a request has
`propertyId`, **`unitId`**, applicant (userId), status, decision. Two candidate
shapes:

- **Option A — extend `Application` with `unitId`** (+ a `kind` for
  initial / transfer / move-out) and **retire `MoveRequest`** for the join flow.
  Smallest model count; reuses the existing applications UI/permissions.
- **Option B — make `MoveRequest` the single request** and fold applications
  into it. Keeps the occupier workflow but renames the prospect entry point.

**Recommendation: Option A.** The prospect flow is the primary entry point and
`Application` already owns it; add the unit, not another concept.

### 5.2 One occupancy pointer
- **Option A — `Lease` is authoritative** (`lease.unitId`); `Unit.status` is a
  derived cache updated only by the allocation service.
- **Option B — `Unit.tenantId` is authoritative**; `Lease` holds billing terms only.

**Recommendation: Option A** — billing already hangs off the lease, and a lease
naturally scopes a unit + terms + dates.

### 5.3 One write path
A single `allocateUnit(request)` / `vacateUnit(leaseId)` service owns every state
transition (unit status, lease, tenant binding). All four current writers call
into it. No other code touches `Unit.status` or creates a `Lease`.

### 5.4 Unit-scoped occupant records
Add `unitId` to `Complaint` (and decide for `Document`, `ChatThread`). Derive it
from the tenant's active lease at creation time.

### 5.5 Smaller navigation
Collapse the tenant nav toward: **Overview · Browse · My Home · Requests ·
Payments · Messages · Documents · Settings** (12 → ~8), moving complaints/service
under "My Home".

## 6. Phase 1 — implementation-ready spec

> **Goal:** a prospect picks a vacant unit, and the request carries that unit.
> **Why first:** highest user-visible value, **purely additive**, no index/data
> migration, and it does **not** depend on decisions D1/D2 — so it is safe to build
> without a `@principal-architect` ruling. It also lays the `unitId` field that
> Phases 2–4 rely on.

### 6.1 Scope / acceptance criteria

When all of these are true, Phase 1 is done:

1. A visitor (signed out or signed in) on `/properties/[id]` for a **published +
   available** property sees a list of that property's `available` units (name,
   block/floor, rent, beds/baths/area).
2. Choosing a unit and submitting creates an `Application` whose stored `unitId`
   is that unit; the tenant's applications view shows the unit.
3. Submitting for a unit that is **not `available`**, **not in that property**, or
   **nonexistent** is rejected (409 / 400 / 404) with a clear message.
4. Applying to a property that is **not published/available** is rejected 409.
5. The owner/caretaker applications table shows the requested **unit**.
6. Existing applications (no `unitId`) still render; all existing tests pass;
   `tsc`, Biome, and `next build` are clean.
7. No database migration is required; `unitId` is additive with a default.

### 6.2 Data model

`src/models/Application.ts` — add one field (default keeps legacy docs valid):

```ts
unitId: { type: String, default: "" },   // empty = property-level request (legacy)
```

Optional query index for the manager surface (not required for correctness):

```ts
applicationSchema.index({ propertyId: 1, unitId: 1, status: 1 });
```

Keep the existing unique partial index `{ propertyId, applicantUserId }` pending
(L34–37) unchanged: it already limits a prospect to one pending request per
property, which also means at most one unit request per property per applicant.
**No reservation** is modelled in Phase 1 — two applicants may request the same
unit; the manager decides and Phase 3 performs the assignment.

### 6.3 Request/response contracts

**`POST /api/v1/applications`** (`src/app/api/v1/applications/route.ts`)

- Request body: `{ propertyId, unitId?, name, email, message? }`.
- New validation (after the existing `Property.findById`, ~L93):
  - **Fix existing gap** — require `property.published === true &&
    property.status === "available"`, else `409 { error: "This home is not
    accepting applications" }`.
  - If `unitId` is provided:
    - `Unit.findById(unitId).select("_id propertyId status name").lean()`
    - not found → `404 { error: "Unit not found" }`
    - `String(unit.propertyId) !== propertyId` → `400 { error: "That unit is not
      part of this property" }`
    - `unit.status !== "available"` → `409 { error: "That unit is no longer
      available" }`
- Persist `unitId: parsed.data.unitId ?? ""`.
- Response `201 { data: <application> }` (unchanged shape + `unitId`).

**`GET /api/v1/applications`** (`src/app/api/v1/applications/route.ts`)

- Extend the existing enrichment block (L56–68) to also resolve `unitName` for the
  page's `unitId`s (map over `Unit`), mirroring the `propertyTitle` pattern:
  ```ts
  const enriched = items.map((a) => ({
    ...a,
    propertyTitle: propertyTitleById.get(String(a.propertyId)) ?? "",
    unitName: unitNameById.get(String(a.unitId ?? "")) ?? "",
  }));
  ```

**New public read for vacant units** — extend `GET /api/v1/properties/[id]`
(`src/app/api/v1/properties/[id]/route.ts`), public branch (L52–55, L66–70):

- For the unauthenticated/tenant branch, also return the property's available
  units, **with a safe projection only** (never `tenantId`/`ownerId`):
  ```ts
  const units = await Unit.find({ propertyId: id, status: "available" })
    .select("name letter floorLevel floorLabel blockName rent beds baths area status")
    .sort({ floorLevel: 1, name: 1 })
    .lean();
  return NextResponse.json({ data: { ...property, units } });
  ```
- Authenticated owner/caretaker/admin branches may include units too, but the safe
  projection applies regardless.

  *Why embed rather than a new endpoint:* one round-trip, and all public
  visibility rules stay in the one place that already gates public properties.

### 6.4 UI / UX

`src/app/properties/[id]/page.tsx`

- **Data source change:** the page currently derives the property from
  `useProperties()` (the list, L34) and never calls `/properties/[id]`. Introduce a
  `useProperty(id)` hook (`src/hooks/use-properties.tsx`) that fetches
  `GET /api/v1/properties/[id]` and returns `{ property, units, loading, error }`.
- **New "Available units" section** (sidebar or below description) — for each
  unit: `name` + block/floor, `formatKES(rent)`, beds/baths/area, and a
  **"Request this unit"** button.
- **Dialog** (reuse the existing one, L291–377): title becomes
  `Request {unitName} · {property.title}`; submit includes `unitId`. Prefill
  name/email from `user` as today.
- **States:**
  - property available & has units → list + per-unit Request.
  - property available & **0 units** → empty state: *"No units are listed right
    now. Submit a general request and the caretaker will suggest one."* (general
    apply, `unitId` omitted).
  - property not available → existing disabled "Not available" (unchanged).
  - `alreadyPending` → per-unit and general request disabled (unchanged).
- **Accessibility:** the unit list is a labelled group; the chosen unit is
  announced in the dialog title.

### 6.5 Client types & hooks

- `src/lib/applications.ts` — add `unitId?: string; unitName?: string;` to
  `Application` and `ApplicationDoc`, and map them in `toApplication`.
- `src/hooks/use-applications.tsx` — add `unitId?: string` to
  `CreateApplicationInput`.
- `src/hooks/use-properties.tsx` — add `useProperty(id)` (detail + units).

### 6.6 Manager surface

- `src/components/applications/ApplicationsView.tsx` — add a **"Unit"** column
  after Property (L134), and include `a.unitName` in the search predicate (L57).
- **Test tripwire:** the two `colSpan={7}` values (L120, L126) become `8`.

### 6.7 Tests

- `src/app/api/v1/applications/route.test.ts` (new/extended):
  - POST stores `unitId` when valid; response includes it.
  - POST → 400 when `unit.propertyId !== propertyId`.
  - POST → 409 when `unit.status !== "available"`.
  - POST → 404 when the unit does not exist.
  - POST → 409 when the property is unpublished/not available.
  - GET enriches `unitName` (add a `unit` stub lookup).
- `src/app/api/v1/properties/[id]/route.test.ts` — public GET returns only
  `available` units with the safe projection (assert no `tenantId`/`ownerId`).
- `src/lib/schemas/application.test.ts` — `unitId` optional; still valid without it.
- `src/components/applications/ApplicationsView.test.tsx` — update `colSpan`
  assertion; assert the Unit column renders `unitName`.
- New `properties/[id]` page/component test — renders available units; submitting
  sends `unitId`.
- Model-mocks already expose a `unit` stub (`src/test/utils/model-mocks.ts`).

### 6.8 Files changed (Phase 1)

| File | Change |
|---|---|
| `src/models/Application.ts` | add `unitId` (+ optional index) |
| `src/lib/schemas/application.ts` | `applicationCreateInput` gains `unitId` |
| `src/app/api/v1/applications/route.ts` | POST validation + persistence; GET `unitName` |
| `src/app/api/v1/properties/[id]/route.ts` | embed `available` units (safe projection) |
| `src/lib/applications.ts` | `Application`/`ApplicationDoc`/`toApplication` gain unit fields |
| `src/hooks/use-applications.tsx` | `CreateApplicationInput` gains `unitId` |
| `src/hooks/use-properties.tsx` | add `useProperty(id)` |
| `src/app/properties/[id]/page.tsx` | vacant-units list + unit-aware dialog |
| `src/components/applications/ApplicationsView.tsx` | Unit column; colSpan 7→8; search |
| tests (3–4 files) | as §6.7 |

### 6.9 Rollout / migration

- **Additive only.** `unitId` defaults `""`; existing documents and clients keep
  working; no backfill required.
- Optional: backfill the one approved application's `unitId` to the unit its
  applicant occupies (via a one-off `--dry-run` script, precedent
  `scripts/backfill-*`).
- Optional: since Phase 1 only *captures* the unit, add a small note on the manager
  decision dialog that the requested unit is what Phase 3 will allocate.

### 6.10 Edge cases

| Case | Behaviour |
|---|---|
| Unit becomes occupied between browse and submit | 409 "no longer available" |
| Property unpublished mid-flight | 409 |
| Applicant already has a pending request for the property | existing 409 preserved |
| `unitId` for a unit in another property | 400 |
| Legacy application with no `unitId` | renders; `unitName` = "—" |
| Tenant with an existing tenancy applies | allowed (unchanged behaviour) |

## 7. Phases 2–5 — direction (detail deferred until D1/D2)

| Phase | Change | Value | Risk |
|---|---|---|---|
| 2 | Single `allocateUnit`/`vacateUnit` service; route all four writers through it | medium | **med** (concurrency) |
| 3 | Approval allocates unit + lease + tenancy **atomically** ("accepted ⇒ moved in", uses Phase 1's `unitId`) | **high** | med |
| 4 | Add `unitId` to occupant records (complaints first), derived from the active lease | high | low |
| 5 | Nav/IA consolidation (My Home) | medium | low |

These are **outline only** — they are rewritten into full specs once D1/D2 are
decided, because that decision changes their shape.

## 8. Risks & prerequisites

- **Live divergence: none** (§4). The 1 occupied unit matches a lease; Phase 2–5
  risk is therefore *future* divergence and code surface, not a data cleanup.
- **Legacy risk that is real:** 1 tenant with `userId:""` needs binding on next
  sign-in; `Unit.tenantId` may historically hold a Tenant doc id (fallback exists).
- **Indexes to revisit (Phases 2–4, not Phase 1):** `Lease` unique `{tenantId}`
  active; `Application` unique `{propertyId, applicantUserId}` pending;
  `UnitPreference` unique `{userId, propertyId}`.
- **Test tripwires:** exact `select()` string assertion in
  `src/app/api/v1/tenants/route.test.ts`; `colSpan` assertions in
  `MoveRequestsView.test.tsx` and `ApplicationsView.test.tsx` (Phase 1 changes the
  latter).
- **Rollout:** no staging env or feature flags in the repo. Phase 1 needs none
  (additive); Phases 2–3 do.
- **Blocked capability:** the mandated `@principal-architect` ruling could not be
  obtained (agent tier unfunded). Phase 1 does not require it; Phases 2–3 should
  not be finalised without it.

## 9. Open decisions requested

1. **D1** — request model: `Application`+`unitId` (recommended) vs unify on `MoveRequest`.
2. **D2** — occupancy authority: `Lease` (recommended) vs `Unit.tenantId`.
3. **D3** — scope: **Phase 1 now** (recommended — additive, no ruling needed) and
   stop, vs commit to Phases 1–5 as one programme.
4. **D4** — hold Phases 2–3 (the data-contract change) for a funded
   `@principal-architect` review? (Recommended: yes.)
