# Simplify user flows

Status: **PROPOSAL — pending decisions D1–D4**
Branch: `feature/simplify-user-flows`
Author: Orchestrix (inline)
Date: 2026-10-17
Updated: 2026-10-17 (split into per-phase specs)

> Note: produced with the multi-agent tier unavailable ("Insufficient account
> funds"). A cross-system data-contract change like this would normally get a
> Tier 1 deep-dive plus a `@principal-architect` ruling. The target model is a
> **proposal for decision**, not a ruling — **except Phase 1, which is additive
> and safe to build without a ruling.** Phases 2–3 should not be finalised
> without it.

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
| 3 | `PATCH /units/[id]` with `tenantId` | `src/app/api/v1/units/[id]/route.ts:90–94` | occupies unit (no lease) |
| 4 | `POST /api/v1/leases` | `src/app/api/v1/leases/route.ts:103` | lease (no occupancy) |

Paths 3 and 4 can leave **occupancy and lease out of sync**. Only path 2 uses an
atomic claim (`findOneAndUpdate {status:"available"}` L91–95); path 1 sets
`unit.tenantId` then `save()` (L83–87) and is **race-prone**.

### 3.3 Two sources of truth for occupancy
- `Unit.tenantId` + `Unit.status` (stores a **userId**, with a legacy fallback to a
  **Tenant document id** — `src/lib/tenancy.ts` L146–149).
- `Lease` (`{ tenantId, propertyId, ownerId, rentAmount, frequency, startDate }`
  — **no `unitId`**; unique partial `{ tenantId }` where `status:"active"`).
- Nothing guarantees they agree; four writers make divergence likely.

### 3.4 Two tenant "I want a unit" mechanisms, three UIs
- **`UnitPreference`** ("Prefer") — passive wish (**0 documents in production**).
- **`MoveRequest` type `move-in`** — the real request; approvable.
- Request UI appears in **both** `src/components/units/TenantUnitsView.tsx`
  ("Request this unit" + "Prefer") and
  `src/app/dashboard/tenant/move-requests/page.tsx` ("Request a move-in").

### 3.5 Tenancy is created in five+ ways
`POST /api/v1/tenants`, application approval `admitApprovedApplicant`
(`src/app/api/v1/applications/[id]/route.ts` L58–95), move-request email heal
(`src/app/api/v1/move-requests/route.ts` L119–132), plus three backfill scripts.

### 3.6 Occupant requests are NOT unit-scoped
- `src/models/Complaint.ts` has **no `unitId`** (fields L14–45); the POST handler
  resolves the tenant by `userId` and derives `propertyId`
  (`src/app/api/v1/complaints/route.ts` L89–115). So a complaint cannot say
  "the leak in **unit 3A**".
- `src/models/ChatThread.ts` is **property-scoped** too (no `unitId`).

### 3.7 No public way to list vacant units
- `GET /api/v1/units` (`src/app/api/v1/units/route.ts` L11–14) **requires auth**,
  and tenants are scoped to properties they already tenancy (L39–50) — a prospect
  with no tenancy gets `[]`. So even *showing* vacant units publicly needs new work.

### 3.8 Surface area
- Tenant nav = **12 items** (`src/config/dashboardNav.ts` L112–125).
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
- **Phases 2–5 are preventive/structural, not data-cleanup.** Migration risk is
  near-zero; the cost is code surface + UX, not data.
- `UnitPreference` is a **dead mechanism** in production → safe candidate to retire (D1).
- The one legacy risk that *does* exist is the **1 unlinked tenant**
  (`userId:""`) — a real person who will need binding when they next sign in.

## 5. Proposed target model (for decision)

### 5.1 One request object
Make **one** request record that starts at the unit: a request has `propertyId`,
**`unitId`**, applicant (userId), status, decision. Two candidate shapes:

- **Option A — extend `Application` with `unitId`** (+ a `kind` for
  initial / transfer / move-out) and **retire `MoveRequest`** for the join flow.
- **Option B — make `MoveRequest` the single request** and fold applications into it.

**Recommendation: Option A.** The prospect flow is the primary entry point and
`Application` already owns it; add the unit, not another concept.

### 5.2 One occupancy pointer
- **Option A — `Lease` is authoritative** (`lease.unitId`); `Unit.status` is a
  derived cache updated only by the allocation service.
- **Option B — `Unit.tenantId` is authoritative**; `Lease` holds billing terms only.

**Recommendation: Option A** — billing already hangs off the lease, and a lease
naturally scopes a unit + terms + dates.

### 5.3 One write path
A single `allocateUnit` / `vacateUnit` service owns every occupancy transition.
All four current writers call into it (Phase 2).

### 5.4 Unit-scoped occupant records
Add `unitId` to `Complaint` (then `ChatThread`), derived from the tenant's active
lease/occupied unit at creation time (Phase 4).

### 5.5 Smaller navigation
Collapse the tenant nav toward: **Overview · Browse · My Home · Requests ·
Payments · Messages · Documents · Settings** (12 → ~8) (Phase 5).

## 6. Phase specs

| Phase | Spec | Status | Depends on |
|---|---|---|---|
| 0 | this document (decisions) | pending D1–D4 | — |
| 1 | [Prospect picks a unit](./phase-1-prospect-picks-unit.md) | **implementation-ready** | — |
| 2 | [Single allocation service](./phase-2-allocation-service.md) | spec ready | D2 |
| 3 | [Approval allocates the unit](./phase-3-approval-allocates.md) | spec ready | D1, D2 |
| 4 | [Unit-scoped occupant records](./phase-4-unit-scoped-requests.md) | spec ready | D2 |
| 5 | [Navigation / IA consolidation](./phase-5-navigation.md) | spec ready | — |

Phase 2–3 specs are written against the **recommended** options (A for D1 and D2);
§"If the decision differs" in each file records the delta if the other option wins.

## 7. Cross-cutting risks & prerequisites

- **Live divergence: none** (§4). The 1 occupied unit matches a lease; Phase 2–5
  risk is *future* divergence and code surface, not a data cleanup.
- **Legacy risk that is real:** 1 tenant with `userId:""` needs binding on next
  sign-in; `Unit.tenantId` may historically hold a Tenant doc id (fallback exists
  in `src/lib/tenancy.ts` L146–149).
- **Indexes to revisit (Phases 2–4, not Phase 1):** `Lease` unique `{tenantId}`
  active; `Application` unique `{propertyId, applicantUserId}` pending;
  `UnitPreference` unique `{userId, propertyId}`.
- **Test tripwires:** exact `select()` string assertion in
  `src/app/api/v1/tenants/route.test.ts`; `colSpan` assertions in
  `MoveRequestsView.test.tsx` and `ApplicationsView.test.tsx`.
- **Rollout:** no staging env or feature flags in the repo. Phase 1 needs none
  (additive); Phases 2–3 do.
- **Blocked capability:** the mandated `@principal-architect` ruling could not be
  obtained (agent tier unfunded). Phase 1 does not require it; Phases 2–3 should
  not be finalised without it.

## 8. Open decisions requested

1. **D1** — request model: `Application`+`unitId` (recommended) vs unify on `MoveRequest`.
2. **D2** — occupancy authority: `Lease` (recommended) vs `Unit.tenantId`.
3. **D3** — scope: **Phase 1 now** (recommended — additive, no ruling needed), or
   commit to Phases 1–5 as one programme.
4. **D4** — hold Phases 2–3 (the data-contract change) for a funded
   `@principal-architect` review? (Recommended: yes.)
