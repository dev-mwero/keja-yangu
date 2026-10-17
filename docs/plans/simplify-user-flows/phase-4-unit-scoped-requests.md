# Phase 4 — Unit-scoped occupant records

Part of [Simplify user flows](./README.md).
Status: spec ready · Depends on: **D2** (needs a resolvable occupancy) · Risk: low

> **Goal:** when an occupant raises something — a complaint, later a chat — it is
> tied to the **unit they occupy**, not just the property. Today a complaint cannot
> say "the leak in unit 3A".

## 1. Current behaviour

- `src/models/Complaint.ts` fields (L14–45): `tenantId` (Tenant doc id),
  `propertyId`, `ownerId`, `subject`, `category`, `message`, `status`, `priority`,
  resolution fields. **No `unitId`.** Indexes L47–49 are property/tenant scoped.
- `POST /api/v1/complaints` (`src/app/api/v1/complaints/route.ts` L89–115) resolves
  the caller's `Tenant` rows by `userId`, derives `propertyId` (and asks for it
  explicitly when the user maps to multiple properties), and stores the complaint
  with **no unit**.
- `src/models/ChatThread.ts` is likewise property-scoped (L10–20, no `unitId`).

## 2. Target

Add an optional `unitId`, derived server-side from the occupant's current unit at
creation time. The client never supplies it (avoids spoofing); it is inferred.

### Data model — `src/models/Complaint.ts`

```ts
unitId: { type: String, default: "" },   // occupied unit at creation; "" if none
```

```ts
complaintSchema.index({ unitId: 1, createdAt: -1 });
```

### Creation — `POST /api/v1/complaints`

After the property is resolved for the actor (existing L97–114), resolve the unit:

```ts
const unit = await Unit.findOne({
  propertyId, tenantId: actor.userId, status: "occupied", deletedAt: null,
}).select("_id").lean();
// store unitId: unit ? String(unit._id) : ""
```

Reuse the Phase 2 occupancy rule so the resolution matches the allocation service.

### Read — `GET /api/v1/complaints` & serialization

- `src/lib/complaints.ts` `serializeComplaint` gains `unitId` + `unitName`
  (resolve via a `Unit` title/name map, mirroring `propertyTitleMap`).
- The list/detail UI (`src/components/complaints/**`, tenant + manager views) shows
  the unit alongside the property.

## 3. UI

- Tenant complaints list/detail: show *"Unit 3A · Valley View"*.
- Owner/caretaker complaints list: add a **Unit** column / filter so the manager
  knows which unit is affected.

## 4. Files changed

| File | Change |
|---|---|
| `src/models/Complaint.ts` | add `unitId` (+ index) |
| `src/app/api/v1/complaints/route.ts` | derive `unitId` on POST; enrich GET |
| `src/lib/complaints.ts` | `serializeComplaint` + types gain unit fields |
| `src/components/complaints/**` | display unit (tenant + manager) |
| tests | see §6 |

## 5. Migration

**None required.** The audit shows **0 complaints** in production. If that changes
before Phase 4 ships, backfill `unitId` from the complaint's tenant's occupied unit
at creation date (best-effort) via a `--dry-run` script.

## 6. Tests

- POST by an occupant → complaint stored with the occupied `unitId`.
- POST by a tenant with **no** unit → `unitId: ""` (allowed; not an error).
- POST by a tenant mapping to multiple properties → unit resolves within the chosen
  property.
- GET → `unitName` present; manager list shows the unit.

## 7. Acceptance criteria

1. A complaint raised by an occupant records the unit they occupy.
2. Managers can see which unit a complaint is about.
3. Tenants with no unit can still complain (property-level fallback).
4. Suite green; `tsc`, Biome, build clean.

## 8. Edge cases

| Case | Behaviour |
|---|---|
| Occupant vacates, then files elsewhere | unit resolved at creation time only |
| Tenant in multiple properties | unit resolved within the selected property |
| No occupancy | `unitId: ""`; UI shows "—" |

## 9. Follow-on (same phase, optional)

- `ChatThread` gains `unitId` the same way so conversations are unit-aware.
- `PropertyDocument` / tenant documents: decide whether they are unit-scoped.

## 10. If the decision differs

- **D2 = Unit.tenantId authoritative (Option B):** the resolution query is the same
  (`Unit.findOne({ propertyId, tenantId, status:"occupied" })`); nothing changes.
