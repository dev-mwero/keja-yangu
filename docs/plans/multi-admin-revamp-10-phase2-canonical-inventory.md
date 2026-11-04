# Phase 2 — Canonical Inventory

**Status:** Authorized — implementation begins 2026-11-02  
**Goal:** Make property, block and unit records independent of management authority.  
**Depends on:** Phase 1 complete (`feat/revamp`, commit `a67edab`)

> [!IMPORTANT]
> Authorization boundary: local code and test work only. No production data migration or deployment.

---

## What the plan doc says to do

| # | Task | Notes |
|---|---|---|
| 1 | Add `Block` collection + dual-write/mirror from `Property.blocks[]` | New Mongoose model; embedded blocks remain for backward compat |
| 2 | Add `Property.lifecycleState`, identity fields, duplicate detection | Soft duplicate matching on title + location signals |
| 3 | Add property claim/verification/merge flows (system-admin merge) | `PropertyClaim` model already exists |
| 4 | Update property creation to create creator's admin assignment + billing account pointer | Just the pointer in Phase 2; billing account is Phase 3 |
| 5 | Update structure edits to keep `Block` and embedded blocks consistent by id | Sync on create/update/delete of blocks |
| 6 | Add unit billing pointer (model only; billing behavior in Phase 3) | Add `billingAccountId` field to Unit; nullable for now |
| 7 | Migrate blocks and validate unit parent chains | Dry-run script |
| 8 | Keep legacy property public pages untouched | No changes to public GET endpoints |

---

## Current state of existing code

### Property model (`src/models/Property.ts`)
- Has embedded `blocks[]` (blockSchema with `_id: true`) → serves as source of truth today
- Has `ownerId`, `caretakerIds`, `custodianIds` (legacy management fields)
- No `lifecycleState`, no explicit identity/location structured fields
- `PropertyClaim` and `PropertyOwnership` models already exist

### Unit model (`src/models/Unit.ts`)
- References blocks via `blockId` (string) + `blockName` (string)
- `ownerId` is required — legacy management field
- No `billingAccountId` yet
- Unique index on `{ blockId, name }` (live units only)

### Property creation route (`POST /api/v1/properties`)
- Creates property with embedded blocks, inserts Unit docs
- For `admin` role: no `ManagementAssignment` auto-created on property creation
- For `owner` role: sets `ownerId` = actorId

### `PropertyClaim` model
- `propertyId`, `claimantUserId`, `evidence`, `status` (`pending`/`approved`/`rejected`)
- `reviewedByUserId`, `reviewedAt`, `decisionNote`
- Already has indexes on `{ propertyId, status }` and `{ claimantUserId, status }`

---

## Implementation plan (step by step)

### Step 1 — `Block` model
Create `src/models/Block.ts` — a standalone collection mirroring `Property.blocks[]` subdocs.

Fields: `propertyId`, `name`, `order`, `rentOverride`, `purpose`, `legacyEmbeddedId`
(the `_id` of the matching embedded subdoc), `deletedAt`.

### Step 2 — `Property` schema additions
Add to `Property.ts`:
- `lifecycleState`: enum `["active", "decommissioned", "merged"]`, default `"active"`
- `canonicalId`: string (set when merged into another property), default `""`
- `identityHash`: string (deterministic hash of title + location for duplicate detection), default `""`

### Step 3 — Duplicate detection service
Create `src/lib/property-identity.ts`:
- `computeIdentityHash(title, location)` — normalised lowercase trim hash
- `findDuplicateCandidates(title, location)` — returns properties with same hash
- `createPropertyClaim(claimantUserId, propertyId, evidence)` — wrapper around `PropertyClaim.create`

### Step 4 — Property creation update
Update `POST /api/v1/properties`:
- After creating the property, dual-write each block to the `Block` collection
- Auto-create a `ManagementAssignment` for the creating `admin` (scopeType=property, full permission set)
- Compute and store `identityHash` on the property
- Check for duplicate candidates; if found, include `duplicateCandidates` in the response (warning only — not a block)

### Step 5 — Property claim routes
Create `src/app/api/v1/properties/[id]/claim/route.ts`:
- `POST` — admin submits a claim for an existing property (creates `PropertyClaim`)
- `GET` — system-admin lists all pending claims for a property

Create `src/app/api/v1/admin/property-claims/[claimId]/route.ts`:
- `PATCH` — system-admin approves/rejects claim; on approve: creates `ManagementAssignment` for the claimant

### Step 6 — Block sync on structure edits
Update `PATCH /api/v1/properties/[id]/structure` to:
- Keep `Property.blocks[]` and the `Block` collection in sync
- New block subdoc → insert into `Block` collection
- Updated block → update `Block` record
- Deleted block → soft-delete `Block` record

### Step 7 — Unit billing pointer
Add `billingAccountId: { type: String, default: "" }` to `Unit.ts`.  
No billing logic wired yet — that is Phase 3.

### Step 8 — Dry-run migration script
Create `scripts/backfill-blocks.ts`:
- Reads all live properties
- For each embedded block, inserts/updates a `Block` doc (idempotent by `legacyEmbeddedId`)
- Reports mismatches (units whose `blockId` doesn't match any known `Block`)
- Dry-run by default; `--apply` flag to write

---

## Exit criteria (from approved plan doc)

- [ ] Every live unit resolves to a block in the same property
- [ ] Structure create/edit/delete preserves unit ids and occupancy
- [ ] Two admins can add blocks/units to the same property without overwriting each other
- [ ] Duplicate/claim flow is audited and does not auto-merge
- [ ] No occupancy write outside `lib/allocation.ts`

---

## Rollback

Continue reading embedded `Property.blocks[]`; disable the `Block` read flag.
The mirror can be rebuilt from `Property.blocks[]` at any time.

---

## Implementation order

1. `Block` model + unit tests
2. Property schema additions (non-breaking additive fields)
3. `property-identity.ts` service + tests
4. `POST /api/v1/properties` update (auto-assignment + duplicate signal + block dual-write) + tests
5. Claim routes (`/properties/[id]/claim` + `/admin/property-claims/[claimId]`) + tests
6. Structure edit block sync + tests
7. Unit `billingAccountId` field (model-only, no behavior change)
8. `scripts/backfill-blocks.ts` dry-run script
9. Docs update (`07-phased-implementation.md`) + commit

