# Simplify user flows

Status: **PROPOSAL — pending decision**
Branch: `feature/simplify-user-flows`
Author: Orchestrix (inline)
Date: 2026-10-17

> Note: this plan was produced with the multi-agent tier unavailable
> ("Insufficient account funds"). Normally a cross-system data-contract change
> like this would get a Tier 1 deep-dive plus a `@principal-architect` ruling.
> The target model below is therefore a **proposal for decision**, not a ruling.

## 1. The question

> "Why do I feel every user flow is over-complicated? Have we over-engineered this?"

**Answer: yes — not everywhere, but at the exact steps that matter most.** The
product has grown several *parallel mechanisms that each solve the same
lifecycle step* (get a person into a unit), plus request records that are not
anchored to the unit. The intended flow is simple; the implementation offers the
user a menu of overlapping ways to achieve the same thing.

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
- `src/models/Application.ts` has **no `unitId`** — applications are property-level.
- `src/app/properties/[id]/page.tsx` renders a property + an "Apply for this home"
  form (`handleApply` L81, button L315–321). **No vacant-unit list, no unit choice.**
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
- **`UnitPreference`** ("Prefer") — passive wish.
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

### 3.7 Surface area
- Tenant nav = **12 items** (`src/config/dashboardNav.ts` `tenantSections`).
- **60** API route files, **18** models.

## 4. Proposed target model (for decision)

### 4.1 One request object
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

### 4.2 One occupancy pointer
Pick a single authoritative "who is in which unit":
- **Option A — `Lease` is authoritative** (`lease.unitId`); `Unit.status` is a
  derived cache updated only by the allocation service.
- **Option B — `Unit.tenantId` is authoritative**; `Lease` holds billing terms only.

**Recommendation: Option A** — billing already hangs off the lease, and a lease
naturally scopes a unit + terms + dates.

### 4.3 One write path
A single `allocateUnit(request)` / `vacateUnit(leaseId)` service owns every state
transition (unit status, lease, tenant binding). All four current writers call
into it. No other code touches `Unit.status` or creates a `Lease`.

### 4.4 Unit-scoped occupant records
Add `unitId` to `Complaint` (and decide for `Document`, `ChatThread`). Derive it
from the tenant's active lease at creation time. This satisfies "every request
going forward is associated to the unit they're occupying".

### 4.5 Prospect flow on the property page
`src/app/properties/[id]/page.tsx` gains a **vacant-units list**; "Request" sends
`{ propertyId, unitId }`. Manager approval then *is* the move-in.

### 4.6 Smaller navigation
Collapse the tenant nav toward: **Overview · Browse · My Home · Requests ·
Payments · Messages · Documents · Settings** (12 → ~8), moving complaints/service
under "My Home".

## 5. Phased change plan

| Phase | Change | User-visible value | Risk |
|-------|--------|--------------------|------|
| 0 | Decide 4.1/4.2 (this doc) | — | none |
| 1 | Prospect picks a unit on the property page; request carries `unitId` | **high** — fixes the core gap | low |
| 2 | Single `allocateUnit`/`vacateUnit` service; route all writers through it | medium | **med** (concurrency, legacy) |
| 3 | Make approval allocate the unit + lease + tenancy atomically | **high** — "accepted ⇒ moved in" | med |
| 4 | Add `unitId` to occupant records (complaints first) | high | low |
| 5 | Nav/IA consolidation (My Home) | medium | low |

## 6. Risks & prerequisites

- **Legacy data**: tenants with `userId:""`; `Unit.tenantId` sometimes a Tenant
  doc id, sometimes a userId; occupied units with no lease — all need
  reconciliation/backfill (precedent: `scripts/backfill-*`, `--dry-run`).
- **Indexes to revisit**: `Lease` unique `{tenantId}` active;
  `Application` unique `{propertyId, applicantUserId}` pending;
  `UnitPreference` unique `{userId, propertyId}`. Merging concepts changes these.
- **Test tripwires**: exact `select()` string assertion in
  `src/app/api/v1/tenants/route.test.ts`; `colSpan` assertions in
  `MoveRequestsView.test.tsx`; button-name assertions in `TenantUnitsView.test.tsx`.
- **Rollout**: no staging env or feature flags in the repo today; a model
  consolidation would be a coordinated multi-file release. Needs a decision on
  cut-over strategy before Phase 2.
- **Blocked capability**: the mandated `@principal-architect` ruling could not be
  obtained (agent tier unfunded). A cross-system data-contract decision of this
  size should not be finalised without it.

## 7. Open decisions requested

1. **D1** — request model: `Application`+`unitId` (recommended) vs unify on `MoveRequest`.
2. **D2** — occupancy authority: `Lease` (recommended) vs `Unit.tenantId`.
3. **D3** — scope now: do **Phase 1 only** (prospect picks a unit — highest value,
   lowest risk) and stop, or plan Phases 1–5 as one programme?
4. **D4** — should we wait for the `@principal-architect` ruling before touching
   the data contract (Phases 2–3)?
