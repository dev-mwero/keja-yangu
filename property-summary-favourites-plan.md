# Plan: Property unit-summary view + Favourites (love) feature + related discovery features

## 1. Goals

| # | Goal | Why |
|---|------|-----|
| A | When viewing a property, show a **compact unit summary** instead of dumping every unit ("ground floor − 2 units available, Block B floor 1 − 6 units"). | Reduces overwhelm; gives an at-a-glance availability picture. |
| B | Let a logged-in user **love/favourite a property** with one click, then see their favourites on their dashboard. | Keeps shortlisted homes easy to return to. |
| C | Add **closely related discovery features** that naturally group with A & B (saved searches, recently viewed, compare, contact). | One coherent "discovery & shortlist" surface for tenants/hunters. |

## 2. Feature A — Compact unit summary on the property view

### Current behaviour
`GET /api/v1/properties/[id]` (route.ts lines 79-84) returns **all available units** as a flat array. For a 24-unit property that's a large payload and visually overwhelming.

### Desired behaviour
Return a **per floor/block rollup** such as:
- "Ground floor − 2 units available"
- "Block B, floor 1 − 6 units (4 available, 2 occupied)"
- "Block A − 12 units total (8 available)"

### Design

**API** — add a summary endpoint and keep the existing property GET response backward-compatible:
```
GET /api/v1/properties/[id]/unit-summary
```
Response shape:
```json
{
  "data": {
    "propertyId": "...",
    "totalUnits": 24,
    "byStatus": { "available": 14, "occupied": 8, "maintenance": 2 },
    "floors": [
      { "label": "Ground", "level": 0, "block": null, "total": 4, "available": 2 },
      { "label": "1", "level": 1, "block": "B", "total": 6, "available": 4, "occupied": 2 }
    ],
    "blocks": [
      { "name": "B", "total": 12, "available": 7, "occupied": 5 }
    ]
  }
}
```
- Sorted by block order then floor level (matches `property.blocks[].order` / `floor.level`).
- Counts come from the **live `Unit` collection** (source of truth), not from the informational `Property.blocks[].floors[].unitsPerFloor`.
- Soft-deleted units excluded (soft-delete plugin).

**Route guard** — follows existing property-view pattern:
- Unauthenticated / tenant / public: allowed for `published: true` + `status: "available"` properties (public viewing).
- Owner / caretaker / custodian / system-admin: allowed per their existing property scope (`unit:read` on the property).

**Frontend** — property detail page renders the summary as compact chips/rows instead of a full unit list. Keep an optional "View all units" expansion for managers who need the detail (quiz Q1).

### Files (planned)
- New: `src/app/api/v1/properties/[id]/unit-summary/route.ts` + `route.test.ts`
- Modify: `src/app/api/v1/properties/[id]/route.ts` (`?includeUnits=0` omits unit records; default remains unchanged)
- Modify: property detail client page to render summary chips

---

## 3. Feature B — Love / Favourite a property

### Model
New Mongoose model `src/models/PropertyFavorite.ts`:
```ts
{
  userId: String (required, indexed),
  propertyId: String (required, indexed),
  createdAt: Date (default now),
}
```
Unique compound index `{ userId: 1, propertyId: 1 }` — one favourite per user per property (idempotent toggle).

Alternative considered (rejected for now): an array field `favouritePropertyIds` on `User`. A separate model is cleaner for querying, counting, notifications, and avoids unbounded array growth on the user doc.

### API
```
POST   /api/v1/favourites          body: { propertyId }   → toggle (create or delete)
GET    /api/v1/favourites          → list current user's favourites (paginated, with property details)
DELETE /api/v1/favourites/[propertyId] → remove one favourite
GET    /api/v1/favourites/[propertyId]/status → is this property favourited by me? (for button state)
```
Auth: any **authenticated** user (tenant, caretaker, custodian, owner, system-admin). Quiz Q2 asks whether to restrict to tenants only.

### Frontend
- Heart icon button on `PropertyCard` and property detail page: filled when favourited, outline when not. Optimistic toggle with server sync.
- New tenant dashboard section/page **"My favourites"** listing favourited properties (cards), with option to remove.

### Files (planned)
- New: `src/models/PropertyFavorite.ts`
- New: `src/app/api/v1/favourites/route.ts` + `route.test.ts`
- New: `src/app/api/v1/favourites/[propertyId]/route.ts` + `route.test.ts` (status and remove)
- New: `src/app/dashboard/tenant/favourites/page.tsx`
- New: `src/components/property/PropertyFavoriteButton.tsx`
- Modify: `PropertyCard.tsx` (add heart button), property detail page (add heart button)

---

## 4. Feature C — Related "similar" discovery features (grouped with A & B)

These are small, logically connected, and cheap to add together:

### C1. Recently viewed properties
Track the last N properties a user viewed (`PropertyView` model: one user/property row with an updated `viewedAt`). Dashboard shows a "Recently viewed" row.

Implemented by `POST /api/v1/properties/[id]/view`, `GET /api/v1/properties/recently-viewed`,
the `PropertyView` model, and a tenant dashboard row.

### C2. Saved searches + alerts
Save a search filter (location, beds, price range, purpose) and get notified when a matching available property is published. (`SavedSearch` model + optional email/in-app notify.)

### C3. Compare properties
Select 2–4 properties → side-by-side comparison table (price, beds, baths, area, location, units available).

### C4. Contact / inquire on a property
Button on property detail to send an inquiry to the owner/caretaker (creates a `Complaint`/`Inquiry` or uses existing chat).

**Scope decision:** implement C1 (recently viewed) as a lightweight addition. Defer saved searches,
compare, and contact/inquiry (C2–C4).

---

## 5. Implementation defaults

- Unit summaries are public for published, available properties and available to scoped managers
  for properties they can read.
- Units are grouped by block and floor, with totals by available/occupied/maintenance status.
- Property detail keeps unit-level requests available behind a collapsed "View and request a
  specific unit" disclosure.
- Any authenticated role may favourite a published, available property. There is no arbitrary
  per-user limit; one unique model row is stored per user/property pair.
- Favourite controls appear on property cards and details. Tenants have a dedicated
  `/dashboard/tenant/favourites` page with pagination.
- Favourite status changes do not send notifications in this MVP.
- Recently viewed is included on the tenant dashboard. Saved searches, comparison, and inquiries
  remain deferred.
- Unit summaries are computed live from the `Unit` collection.

---

## 6. Verification plan (to run at implementation time)

- `npm test` (vitest) — all existing + new tests pass
- `npx tsc --noEmit` — typecheck clean
- `npx biome check` — lint/format clean
- Manual: property detail shows summary chips; favourite toggle persists and appears on dashboard

## 7. Conventions to follow (from existing code)

- Next.js App Router route handlers in `src/app/api/v1/...`, with `route.test.ts` beside each route.
- Mongoose models in `src/models/` using `models.X || model<...>("X", schema)` singleton + `softDeletePlugin`.
- Zod schemas in `src/lib/schemas/`; Biome formatting (2-space indent, double quotes, width 100).
- Auth via `authenticate()`/`requirePermission()` from `src/lib/permissions`; `keja-token` cookie.
- Tests mock models via `src/test/utils/model-mocks.ts` (`getModelStubs()`) and factories in `src/test/utils/factories.ts`.
- Conventional Commits: `feat(scope): imperative subject`.

---

**Status:** Implemented in the working tree: A, B, and C1. C2–C4 remain deferred.
