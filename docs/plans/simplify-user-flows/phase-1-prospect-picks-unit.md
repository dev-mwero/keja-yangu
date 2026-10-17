# Phase 1 — Prospect picks a vacant unit

Part of [Simplify user flows](./README.md).
Status: **shipped** (`031f7c0`) · Depends on: nothing (additive) · Risk: low

> **Goal:** a prospect picks a vacant unit, and the request carries that unit.
> **Why first:** highest user-visible value, **purely additive**, no index/data
> migration, and it does **not** depend on D1/D2 — so it is safe to build without
> a `@principal-architect` ruling. It also lays the `unitId` field that Phases 2–4
> rely on.

## 1. Current behaviour

- The property page derives the property from the **list** endpoint
  (`useProperties()`, `src/app/properties/[id]/page.tsx` L34) and never calls
  `/properties/[id]`.
- The "Apply for this home" dialog submits `{ propertyId, name, email, message }`
  (`useApplicationMutations.create`, `src/hooks/use-applications.tsx` L79–84).
- `POST /api/v1/applications` stores a property-level row; it does **not** verify
  the property is published/available, and has no unit concept.
- There is **no public listing of vacant units** (`GET /api/v1/units` requires
  auth and scopes tenants to their own property).

## 2. Acceptance criteria

1. A visitor (signed out or in) on `/properties/[id]` for a published + available
   property sees that property's `available` units (name, block/floor, rent,
   beds/baths/area).
2. Choosing a unit and submitting creates an `Application` whose stored `unitId`
   is that unit; the tenant's applications view shows the unit.
3. Submitting for a unit that is not `available`, not in that property, or
   nonexistent is rejected (409 / 400 / 404) with a clear message.
4. Applying to a property that is not published/available is rejected 409.
5. The owner/caretaker applications table shows the requested **unit**.
6. Existing applications (no `unitId`) still render; all existing tests pass;
   `tsc`, Biome and `next build` are clean.
7. No database migration is required; `unitId` is additive with a default.

## 3. Data model

`src/models/Application.ts` — one additive field (default keeps legacy docs valid):

```ts
unitId: { type: String, default: "" },   // empty = property-level request (legacy)
```

Optional query index for the manager surface (not required for correctness):

```ts
applicationSchema.index({ propertyId: 1, unitId: 1, status: 1 });
```

Keep the existing unique partial index `{ propertyId, applicantUserId }` pending
(L34–37) unchanged: it already limits a prospect to one pending request per
property. **No reservation** is modelled in Phase 1 — two applicants may request
the same unit; the manager decides and Phase 3 performs the assignment.

## 4. Contracts

### `POST /api/v1/applications` (`src/app/api/v1/applications/route.ts`)

- Body: `{ propertyId, unitId?, name, email, message? }`.
- Schema: `src/lib/schemas/application.ts` →
  `applicationCreateInput = applicationFormSchema.extend({ propertyId, unitId: z.string().trim().optional() })`.
- After the existing `Property.findById` (L93):
  - **fix existing gap** — require `property.published === true && property.status === "available"`,
    else `409 { error: "This home is not accepting applications" }`.
  - if `unitId`:
    - `Unit.findById(unitId).select("_id propertyId status").lean()`
    - not found → `404 { error: "Unit not found" }`
    - `String(unit.propertyId) !== propertyId` → `400 { error: "That unit is not part of this property" }`
    - `unit.status !== "available"` → `409 { error: "That unit is no longer available" }`
- Persist `unitId: parsed.data.unitId ?? ""`.
- Response `201 { data: <application> }` (unchanged shape + `unitId`).

### `GET /api/v1/applications` (`src/app/api/v1/applications/route.ts`)

Extend the existing enrichment block (L56–68) with `unitName`:

```ts
const unitNameById = new Map(/* Unit.find({_id: {$in: unitIds}}).select("name") */);
const enriched = items.map((a) => ({
  ...a,
  propertyTitle: propertyTitleById.get(String(a.propertyId)) ?? "",
  unitName: unitNameById.get(String(a.unitId ?? "")) ?? "",
}));
```

### Public vacant-unit read — `GET /api/v1/properties/[id]`

`src/app/api/v1/properties/[id]/route.ts`, public branch (L52–55, L66–70) also
returns the property's available units **with a safe projection** (never
`tenantId`/`ownerId`):

```ts
const units = await Unit.find({ propertyId: id, status: "available" })
  .select("name letter floorLevel floorLabel blockName rent beds baths area status")
  .sort({ floorLevel: 1, name: 1 })
  .lean();
return NextResponse.json({ data: { ...property, units } });
```

*Why embed rather than a new endpoint:* one round-trip, and all public visibility
rules stay in the one place that already gates public properties.

## 5. UI / UX

`src/app/properties/[id]/page.tsx`

- **Data source change:** introduce `useProperty(id)` (`src/hooks/use-properties.tsx`)
  that fetches `GET /api/v1/properties/[id]` and returns `{ property, units, loading, error }`;
  stop deriving the property from the list hook.
- **New "Available units" section:** per unit show `name` + block/floor,
  `formatKES(rent)`, beds/baths/area, and a **"Request this unit"** button.
- **Dialog** (reuse the existing one, L291–377): title
  `Request {unitName} · {property.title}`; submit includes `unitId`; prefill
  name/email from `user` as today.
- **States:**
  - available & has units → list + per-unit Request;
  - available & **0 units** → *"No units are listed right now. Submit a general
    request and the caretaker will suggest one."* (apply with `unitId` omitted);
  - not available → existing disabled "Not available";
  - `alreadyPending` → per-unit and general request disabled.
- **Accessibility:** the unit list is a labelled group; the chosen unit is named
  in the dialog title.

## 6. Client types & hooks

- `src/lib/applications.ts` — add `unitId?: string; unitName?: string;` to
  `Application` and `ApplicationDoc`; map both in `toApplication`.
- `src/hooks/use-applications.tsx` — add `unitId?: string` to `CreateApplicationInput`.
- `src/hooks/use-properties.tsx` — add `useProperty(id)`.

## 7. Manager surface

- `src/components/applications/ApplicationsView.tsx` — add a **"Unit"** column
  after Property (L134); include `a.unitName` in the search predicate (L57).
- **Tripwire:** the two `colSpan={7}` values (L120, L126) become `8`.

## 8. Files changed

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
| tests (3–4 files) | see §9 |

## 9. Tests

- `src/app/api/v1/applications/route.test.ts`: POST stores `unitId`; 400 on
  cross-property unit; 409 on unavailable unit; 404 on missing unit; 409 on
  unpublished property; GET enriches `unitName`.
- `src/app/api/v1/properties/[id]/route.test.ts`: public GET returns only
  `available` units and leaks no `tenantId`/`ownerId`.
- `src/lib/schemas/application.test.ts`: `unitId` optional; valid without it.
- `src/components/applications/ApplicationsView.test.tsx`: update `colSpan`;
  assert the Unit column renders `unitName`.
- New `properties/[id]` page/component test: renders available units; submitting
  sends `unitId`.
- `src/test/utils/model-mocks.ts` already exposes a `unit` stub.

## 10. Rollout / migration

- **Additive only.** `unitId` defaults `""`; existing documents and clients keep
  working; no backfill required.
- Optional: backfill the one approved application's `unitId` to the unit its
  applicant occupies (one-off `--dry-run` script, precedent `scripts/backfill-*`).

## 11. Edge cases

| Case | Behaviour |
|---|---|
| Unit becomes occupied between browse and submit | 409 "no longer available" |
| Property unpublished mid-flight | 409 |
| Applicant already has a pending request for the property | existing 409 preserved |
| `unitId` for a unit in another property | 400 |
| Legacy application with no `unitId` | renders; `unitName` = "—" |
| Tenant with an existing tenancy applies | allowed (unchanged) |
