# Keja Yangu — Unit-level favourites + availability notifications

**Status:** Implemented
**Related:** `property-summary-favourites-plan.md` (property favourites shipped), `src/models/PropertyFavorite.ts`, `src/lib/notifications.ts`

## 1. Goal

Let an authenticated user save a **specific unit**, not just a property. If a saved unit later becomes `available`, every user who favourited it receives an in-app notification.

This covers the case the user described: the unit is currently occupied or under repair (maintenance), the user saves it, and later receives "Unit 3A is now available".

**Decisions (confirmed):**

| Decision | Choice |
|---|---|
| Favourite scope | Any non-deleted unit belonging to a **published** property, regardless of unit status |
| Notification channel | In-app only |
| Notification trigger | Unit status transitions to `available` |
| Existing property favourites | Kept unchanged; unit favourites are additive |

## 2. Current state (as-is)

- `PropertyFavorite` stores only `{ userId, propertyId }`; unique on the pair.
- `POST /api/v1/favourites` only allows favouriting properties that are `published: true` **and** `status: "available"`.
- `GET/DELETE /api/v1/favourites/[propertyId]` are property-specific.
- `PropertyFavoriteButton` is the only favourite control; it is used on property cards/detail.
- `/dashboard/tenant/favourites` lists favourited properties only.
- No notification fires when a property or unit becomes available.
- Unit status is written in exactly two places:
  - `PATCH /api/v1/units/[id]` (manager sets `available`/`maintenance`; direct `occupied` is rejected).
  - `src/lib/allocation.ts` — `allocateUnit` (`available → occupied`) and `vacateUnit` (`occupied → available`).
- Public property detail currently fetches only **available** units for the unit-request disclosure.

## 3. Data model

### New model — `src/models/UnitFavorite.ts`

```ts
{
  userId: string;      // required, indexed
  unitId: string;      // required, indexed
  propertyId: string;  // denormalized for list joins/scoping
  createdAt: Date;     // timestamps.createdAt only
}
```

Indexes:

- `{ userId: 1, unitId: 1 }` unique — one favourite per user per unit, toggle is idempotent.
- `{ userId: 1, createdAt: -1 }` — dashboard listing.
- `{ unitId: 1 }` — notification fan-out lookup.

No soft delete: unfavouriting hard-deletes the row, matching `PropertyFavorite`.

### Unit — add `statusChangedAt`

```ts
statusChangedAt: { type: Date, default: null }
```

Set whenever `status` actually changes. This is used to build a stable notification dedupe key per availability transition, so a retried request or duplicate writer cannot send the same "now available" notification twice.

Alternative rejected: using `updatedAt` — it also changes on rent/name edits and would silently suppress or duplicate availability notifications.

## 4. API

Base path follows the existing favourites routes. Property endpoints remain untouched.

### `POST /api/v1/favourites/units` — toggle

Request: `{ unitId: string }`

- Any authenticated user (tenant, caretaker, custodian, owner, system-admin).
- Validate `unitId` is a valid ObjectId.
- Load the unit (not soft-deleted) and its property.
- Require the property to be `published: true` and not soft-deleted.
- **Do not require the unit to be available.** Occupied and maintenance units are valid targets.
- If a favourite exists, delete it and return `{ unitId, favourited: false }`.
- Otherwise create it (unique-index duplicate is treated as success) and return `{ unitId, favourited: true }`.

### `GET /api/v1/favourites/units` — paginated list

- Current user only, newest first.
- Join `Unit` (live docs only) and `Property` (`published: true`, not deleted).
- Return safe unit fields: `_id`, `propertyId`, `name`, `blockName`, `floorLabel`, `floorLevel`, `status`, `rent`, `beds`, `baths`, `area`, `purpose`, `favouritedAt`.
- Add a compact property summary: `title`, `location`, `price`, `images`.
- Never expose `ownerId`, `caretakerIds`, `tenantId`, or internal notes.
- Favourites whose unit/property no longer exists or is unpublished are omitted from the list but the row is retained (so it reappears if republished). This avoids silently deleting a user's saved item.

### `GET /api/v1/favourites/units/[unitId]` — status

Returns `{ unitId, favourited: boolean }` for the current user.

### `DELETE /api/v1/favourites/units/[unitId]` — remove

Deletes the current user's row; returns `{ unitId, favourited: false }`.

## 5. Availability notification

### New notification type

Add `"unit:available"` to:

- `src/models/Notification.ts` — `NOTIFICATION_TYPES`.
- `src/types/notifications.ts` — `NotificationType`.
- `src/components/notifications/NotificationsList.tsx` — `TYPE_LABELS` (`"Unit available"`) and a sensible badge variant.
- `src/lib/schemas/notifications.ts` automatically follows the model enum.

### `notifyUnitAvailable(unit, property?)` — `src/lib/notifications.ts`

Behavior:

1. If the unit is not `available`, return early.
2. Load `UnitFavorite.find({ unitId }).select("userId").lean()`.
3. If no favourites, return `true`.
4. Load the property title if not supplied; skip if the property is unpublished/deleted.
5. For each favouriting user, call `notifyUser`:
   - `type: "unit:available"`
   - `title: "Unit is now available"`
   - `body: "Unit 3A at Riverside Apartments is now available."`
   - `link: "/properties/<propertyId>"` (optionally `?unit=<unitId>` so the detail page can highlight it)
   - `data: { unitId, propertyId, status: "available", eventId: "<unitId>:available:<statusChangedAt ISO>" }`
   - `channels: ["in-app"]`
6. Best-effort like the other helpers: catch and log, never throw.

Dedupe: `notifyUser` already derives a dedupe key from `data.eventId`. Using `statusChangedAt` means each real transition notifies once; an `available → available` write does not create a new key.

### Trigger points

1. **`PATCH /api/v1/units/[id]`**
   - Capture `previousStatus` before applying updates.
   - When `previousStatus !== "available" && unit.status === "available"`, set `statusChangedAt = new Date()` and call `notifyUnitAvailable` **after** `unit.save()`.
   - Setting `maintenance` or editing rent/name must not notify.
2. **`vacateUnit` in `src/lib/allocation.ts`**
   - Only when the last occupant leaves and the unit is written back to `available`.
   - Include `statusChangedAt` in the `$set`, then call `notifyUnitAvailable` with the updated unit snapshot.
3. **Compensation path in `allocateUnit`**
   - The rollback `occupied → available` is an internal failure recovery, not a user-visible availability event. **Do not notify** there.
4. **Direct occupancy writes**
   - `allocateUnit` (`available → occupied`) does not notify.
   - Any future writer of `Unit.status` must go through the same helper; document this next to the existing "single writer for occupancy" comment in `allocation.ts`.

## 6. UI

### New component — `src/components/units/UnitFavoriteButton.tsx`

Mirror `PropertyFavoriteButton`:

- Props: `unitId`, optional `onChange`, optional `canAdd`.
- Same auth behavior: logged-out users are redirected to `/auth?from=<current path>`.
- Calls `/api/v1/favourites/units/[unitId]` for status and toggle.
- Optimistic toggle with rollback on error and `sonner` toast.

### Where the button appears

- **Public property detail** (`src/app/properties/[id]/page.tsx`), inside the unit-request disclosure, on each unit card.
- **Tenant vacant units** (`src/components/units/TenantUnitsView.tsx`), on each unit card.
- Manager tables (`UnitsView`, `PropertyUnitsTable`) do not need it; this is a discovery feature.

### Showing units that are not available

To satisfy "favourite it while it is occupied/under repair":

- Extend the public property detail unit disclosure to list **all non-deleted units** of a published property with a status badge (`available`, `occupied`, `maintenance`).
- Keep the existing summary chips and "Request this unit" action.
- Disable "Request this unit" unless the unit is `available`.
- Never return `tenantId` or occupant PII for these units.
- The existing `GET /api/v1/properties/[id]` can gain `?includeUnits=all` (default stays "available only") or a separate `status=all` query. Prefer a query flag to preserve current public behavior for existing consumers.

### Favourites dashboard — `/dashboard/tenant/favourites`

- Add tabs/sections: **Properties** and **Units**.
- Property tab keeps the existing `PropertyCard` grid.
- Unit tab uses a new `FavouriteUnitCard`:
  - Unit name, block/floor, property title/location.
  - Live status badge.
  - Current rent (from the unit override or property/block/floor fallback, matching existing `effectiveRent` logic).
  - Heart button to remove.
  - "View property" link; "Request this unit" only when available.
- Add a short note: "You'll get an in-app notification when a saved unit becomes available."
- Paginate units with the same page controls as properties.

## 7. Edge cases

- **Unpublished property:** cannot favourite; existing favourites are hidden from the list and receive no notifications while unpublished.
- **Deleted unit/property:** cannot favourite; existing favourites are hidden but retained.
- **Duplicate toggle / race:** unique index; duplicate-key is treated as already favourited.
- **Unfavourite before transition:** no notification (fan-out reads live favourite rows).
- **Repeated availability:** `available → maintenance → available` creates a new `statusChangedAt`, so the second availability notifies again.
- **Direct `available → available` PATCH:** no notification.
- **Large fan-out:** query only `userId`; iterate best-effort. If properties ever accumulate very large favourite counts, move to a background job; not needed for MVP.
- **Email:** not sent; decision is in-app only.

## 8. Files

### Create

- `src/models/UnitFavorite.ts`
- `src/app/api/v1/favourites/units/route.ts` + `route.test.ts`
- `src/app/api/v1/favourites/units/[unitId]/route.ts` + `route.test.ts`
- `src/components/units/UnitFavoriteButton.tsx` (+ test if component tests are added for the property button)
- `src/components/units/FavouriteUnitCard.tsx` (or keep in the favourites page)

### Modify

- `src/models/Unit.ts` — `statusChangedAt`
- `src/lib/notifications.ts` — `notifyUnitAvailable`
- `src/models/Notification.ts` — new type
- `src/types/notifications.ts` — new type
- `src/components/notifications/NotificationsList.tsx` — label/variant
- `src/app/api/v1/units/[id]/route.ts` — detect transition, notify
- `src/lib/allocation.ts` — set `statusChangedAt`, notify on genuine vacate
- `src/app/api/v1/properties/[id]/route.ts` — optional `includeUnits=all` for the disclosure
- `src/app/properties/[id]/page.tsx` — unit status badges + favourite button
- `src/components/units/TenantUnitsView.tsx` — favourite button
- `src/app/dashboard/tenant/favourites/page.tsx` — property/unit tabs
- `src/config/dashboardNav.ts` — unchanged (favourites entry already exists)
- `src/test/utils/factories.ts` / model mocks — add `UnitFavorite`/`statusChangedAt` as needed

## 9. Tests

- **Favourites API**
  - Add a unit favourite when the unit is available, occupied, and in maintenance.
  - Reject a unit whose property is unpublished or deleted.
  - Reject invalid/unknown unit ids.
  - Toggle removes on the second call; duplicate-key is idempotent.
  - List returns only live, published units and paginates; hides unpublished.
  - Status and delete endpoints are user-scoped (user A cannot see/modify user B's row).
- **Notifications**
  - `notifyUnitAvailable` sends to every favouriter and no one else.
  - No favourites → no notifications.
  - Dedupe: same `statusChangedAt` does not notify twice.
  - Unpublished property → no notification.
- **Status writers**
  - `PATCH` `maintenance → available` notifies once; `available → available` and `available → maintenance` do not.
  - `vacateUnit` notifies only when the last occupant leaves.
  - `allocateUnit` compensation does not notify.
- **UI**
  - Favourites page renders property and unit tabs; removing a unit updates the list.

## 10. Verification

```bash
npm run check      # biome
npm run typecheck  # tsc --noEmit
npm run test       # vitest run
```

Manual: favourite an occupied/maintenance unit; set it to `available` as owner/caretaker; confirm the favouriting user sees `Unit available` in `/dashboard/tenant/notifications` and the linked property opens.

## 11. Open defaults (not blocking)

- Deep link uses the property detail page; a `?unit=` query can highlight the unit later.
- No "notify me again" or mute control in MVP; every genuine availability transition notifies.
- Only in-app; email can be added later through the existing `channels` array.
