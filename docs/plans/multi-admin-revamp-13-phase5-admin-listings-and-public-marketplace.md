# Phase 5 — Admin Listings & Public Marketplace

**Status:** Plan Proposed — Implementation Ready  
**Goal:** Replace property-level advertising with unit-level canonical listings and public marketplace discovery.  
**Depends on:** Phase 4 complete (`feat/revamp`, commit `bb3144b`)

> [!IMPORTANT]
> Authorization boundary: Local code, test fixtures, and scripts only. No live production database mutations or deployments.

---

## 1. Objectives & Exit Criteria

### 1.1 Objectives
1. **Canonical `Listing` & `ListingPublisher` Models**:
   - Introduce `Listing` domain model representing a specific unit offer with immutable snapshot rent, deposit terms, media, amenities, and lifecycle state.
   - Introduce `ListingPublisher` domain model representing authorized distribution of a listing with unique `shareCode` attribution (admin publisher only in Phase 5; broker publisher ready for Phase 6).
2. **Lifecycle State Machine & Audit Enforcement**:
   - Formalize state transitions: `draft → active ⇄ paused → let / expired / withdrawn`.
   - Prevent publishing if the unit is currently occupied (`Lease.status = "active"`) or lacks an active billing assignment.
   - Automatically transition active listings to `let` when a unit is leased/allocated.
   - Emit an `AuditEvent` for every state change.
3. **Safe Public Marketplace APIs & Projection**:
   - Provide public search endpoint (`GET /api/v1/marketplace/listings`) and detail endpoint (`GET /api/v1/marketplace/listings/[id]`).
   - Project strictly public fields (property location/county, unit layout, rent, service charge, amenities, media). Strictly hide tenant info, occupancy, landlord PII, and financial ledgers.
4. **Unit Listing Management in Admin Dashboard**:
   - Integrate listing controls into unit management (`/dashboard/admin/units`), allowing admins to create draft listings, configure asking rent, publish, pause, or withdraw unit listings.
5. **Draft Listing Backfill Tooling**:
   - Pure planner `src/lib/listing-backfill.ts` and CLI runner `scripts/backfill-draft-listings.ts` to generate draft listings for currently vacant/available units.
6. **Marketplace Discovery Pages**:
   - Build public unit marketplace views (`/marketplace` or `/listings`) while keeping legacy `/properties` routes operational.

### 1.2 Exit Criteria (from Multi-Admin Revamp Master Plan)
- [ ] Occupied units never appear as available in public listings.
- [ ] Public listing detail exposes no tenant, lease, internal notes, or private landlord data.
- [ ] Maximum one active/live listing per unit enforced by index and validation.
- [ ] All publish, pause, let, and withdraw state transitions are validated, audited, and optimistic-concurrency protected.
- [ ] Unit allocation/leasing automatically transitions associated listing to `let`.
- [ ] Admin can create, publish, manage, and view a unit listing end-to-end.
- [ ] Full Vitest test suite, TypeScript typecheck (`tsc --noEmit`), and Biome linting pass cleanly.

---

## 2. Domain Models & Schemas

### 2.1 `Listing` (`src/models/Listing.ts`)
```ts
export interface IListing {
  propertyId: string;
  blockId?: string;
  unitId: string;
  state: "draft" | "active" | "paused" | "let" | "expired" | "withdrawn";
  headline: string;
  description: string;
  askingRent: number;
  serviceCharge: number;
  depositMonths: number;
  availableFrom: Date;
  minimumStayMonths: number;
  amenities: string[];
  media: Array<{ url: string; key?: string; caption?: string; isPrimary?: boolean }>;
  visibility: "public" | "unlisted";
  canonicalPublisherUserId: string;
  verifiedByUserId?: string;
  verifiedAt?: Date;
  publishedAt?: Date | null;
  expiresAt?: Date | null;
  version: number;
  createdByUserId: string;
  deletedAt?: Date | null;
}
```
**Indexes**:
- Partial unique `{ unitId: 1 }` where `{ state: { $in: ["draft", "active", "paused", "let"] }, deletedAt: null }` (enforces at most one active/in-flight listing per physical unit).
- `{ state: 1, availableFrom: 1, expiresAt: 1 }` (public discovery queries).
- `{ propertyId: 1, state: 1 }` (portfolio filtering).
- `{ visibility: 1, state: 1 }`.

### 2.2 `ListingPublisher` (`src/models/ListingPublisher.ts`)
```ts
export interface IListingPublisher {
  listingId: string;
  publisherUserId: string;
  publisherRole: "admin" | "broker";
  brokerAuthorizationId?: string;
  shareCode: string;
  state: "active" | "paused" | "revoked" | "expired";
  startsAt: Date;
  endsAt?: Date | null;
  createdByUserId: string;
  revokedByUserId?: string;
  revokedAt?: Date | null;
}
```
**Indexes**:
- Partial unique `{ listingId: 1, publisherUserId: 1 }` where `{ state: "active" }`.
- Unique `{ shareCode: 1 }`.
- `{ publisherUserId: 1, state: 1 }`.

### 2.3 Domain Enums (`src/lib/domain-enums.ts`)
- `LISTING_STATES = ["draft", "active", "paused", "let", "expired", "withdrawn"] as const`
- `LISTING_VISIBILITY = ["public", "unlisted"] as const`
- `LISTING_PUBLISHER_ROLES = ["admin", "broker"] as const`
- `LISTING_PUBLISHER_STATES = ["active", "paused", "revoked", "expired"] as const`

---

## 3. Services & Business Logic

### 3.1 Listing State & Transition Engine (`src/lib/listings.ts`)
- **`canTransitionListing(currentState, targetState)`**: Verifies valid transitions according to state machine.
- **`generateListingShareCode(publisherId, listingId)`**: Deterministic base62 or nanoid share code for attribution and clean URLs.
- **`validateListingPublish(unit, listing, options)`**:
  - Enforces `askingRent > 0`.
  - Verifies unit is not occupied (no active lease).
  - Verifies unit has a resolved `billingAccountId`.
- **`toPublicListingProjection(listing, property, unit, publisher)`**:
  - Whitelists only safe consumer-facing fields:
    - Headline, description, asking rent, service charge, deposit months, available date, amenities, media.
    - Property title, neighborhood/city, county.
    - Unit floor level, type, bathrooms, bedrooms, surface area.
    - Share code & contact action.
  - Strips all internal admin notes, unit tenant arrays, property management IDs, and billing account numbers.
- **`transitionListingState(listingId, newState, actorId, reason)`**:
  - Applies state change with version bump.
  - Writes `AuditEvent` record (`action: "listing.state_transition"`).

### 3.2 Allocation & Tenancy Integration (`src/lib/allocation.ts` or lease hooks)
- When a lease becomes active or a unit is allocated, automatically call `letListing(unitId)` to transition any active listing to `"let"`, preventing double-booking and stale marketplace advertisements.

### 3.3 Draft Backfill Planner (`src/lib/listing-backfill.ts`)
- Pure function `planListingBackfill({ units, properties, existingListings, activeLeases })`:
  - Identifies vacant units without any active or draft listing.
  - Builds planned draft `Listing` records pre-populated with unit rent and property media/location.
  - Returns `plannedListings`, `skippedUnits`, and `warnings`.

---

## 4. API Routes

### 4.1 Staff Management Routes (`src/app/api/v1/listings/`)
- `GET /api/v1/listings`:
  - Scoped to admin's assigned properties and units.
  - Supports filters: `propertyId`, `unitId`, `state`.
- `POST /api/v1/listings`:
  - Requires `admin` (or `owner` alias) with permission on unit.
  - Creates draft listing.
- `GET /api/v1/listings/[id]`:
  - Detailed staff view including internal notes and publisher share codes.
- `PATCH /api/v1/listings/[id]`:
  - Update listing details (headline, askingRent, amenities, etc.).
  - Or trigger lifecycle action: `{ action: "publish" | "pause" | "resume" | "withdraw" }`.

### 4.2 Public Marketplace Routes (`src/app/api/v1/marketplace/`)
- `GET /api/v1/marketplace/listings`:
  - Publicly accessible (no authentication required).
  - Filters: `county`, `propertyType`, `minRent`, `maxRent`, `bedrooms`, `amenities`, `q`.
  - Exclusively returns `state = "active"` and `visibility = "public"`.
  - Emits safe public projection only.
- `GET /api/v1/marketplace/listings/[shareCodeOrId]`:
  - Resolves listing by share code or listing ID.
  - Returns public projection for single listing page.

---

## 5. UI Integration

1. **Admin Unit Listing Controls**:
   - In `src/components/units/UnitsView.tsx` or unit detail modal, add listing status badge and "Create Listing" / "Publish" / "Manage Listing" actions.
2. **Public Marketplace Pages**:
   - `src/app/marketplace/page.tsx`: Modern searchable marketplace grid displaying active unit cards.
   - `src/app/marketplace/[id]/page.tsx`: Single unit listing showcase with photo gallery, amenities, rent breakdown, and inquiry/application button.

---

## 6. Implementation & Verification Plan

1. **Step 1: Domain Models & Enums**:
   - Add enums in `src/lib/domain-enums.ts`.
   - Implement `src/models/Listing.ts` and `src/models/ListingPublisher.ts` with unit tests.
   - Register stubs in `src/test/utils/model-mocks.ts`.
2. **Step 2: Business Logic & Backfill Planner**:
   - Implement `src/lib/listings.ts` and `src/lib/listings.test.ts`.
   - Implement `src/lib/listing-backfill.ts` and `src/lib/listing-backfill.test.ts`.
   - Create `scripts/backfill-draft-listings.ts`.
3. **Step 3: Staff & Public API Routes**:
   - Implement `src/app/api/v1/listings/route.ts` & `[id]/route.ts` with route tests.
   - Implement `src/app/api/v1/marketplace/listings/route.ts` & `[id]/route.ts` with route tests.
4. **Step 4: Marketplace Discovery UI**:
   - Implement `/marketplace` and `/marketplace/[id]` pages.
   - Integrate unit listing modal/actions in unit management UI.
5. **Step 5: Full Verification**:
   - Run `npm run typecheck`, `biome check`, and full test suite (`npm test -- --run`).
   - Confirm all exit criteria are satisfied.
