# Keja Yangu — Soft-delete by default (recycle bin / recovery-by-request)

Status: **Stages 1–3 implemented** — data layer (plugin, models, partial unique
indexes, DELETE endpoints, production migration), the recycle-bin API, and the
system-admin recycle-bin UI.

## Decisions (resolved)

1. Scope: **Stage 1 first** (recycle-bin API and UI follow).
2. Index strategy: **partial unique indexes** filtered on `deletedAt: null`.
3. Recovery: **system-admin only** (no owner self-service for now).
4. Retention: **manual purge only** — no auto-purge.

## Goal

Make deletes non-destructive across the app. A `DELETE` marks a record as
deleted (`deletedAt`) instead of removing it. Deleted records disappear from all
normal reads but can be listed and restored by an administrator ("recovery by
request"). Hard purge is explicit and rare.

## Current state (as-is)

Only `PropertyType` carries `deletedAt`, and it is filtered by hand in
`src/lib/property-type-store.ts` (`find({ deletedAt: null })`).

Six DELETE endpoints exist, five of which hard-delete:

| Endpoint | Model | Current behaviour |
|---|---|---|
| `DELETE /api/v1/units/:id` | Unit | `deleteOne` (blocked if occupied) |
| `DELETE /api/v1/leases/:id` | Lease | `deleteOne` (blocked if invoiced) |
| `DELETE /api/v1/properties/:id` | Property | `findOneAndDelete` + `Unit.deleteMany` (blocked if tenants) |
| `DELETE /api/v1/tenants/:id` | Tenant | `deleteOne` |
| `DELETE /api/v1/invoices/:id` | Invoice | `deleteOne` (draft only) |
| `DELETE /api/v1/custodians/:id` | User | already soft: `isActive=false`, unlinked |

Unique indexes that interact badly with soft-deleted rows:

- `Tenant {propertyId, email}` — unique
- `Invoice {invoiceNumber}` — unique; `Invoice {leaseId, period}` partial unique
- `Lease {tenantId}` — partial unique where `status: "active"`
- `PropertyType {key}` — unique

## Design

### 1. Shared plugin — `src/lib/mongoose-soft-delete.ts`

A `softDeletePlugin(schema)` that:

- adds `deletedAt: { type: Date, default: null, index: true }` (idempotent — safe
  to apply to `PropertyType`, which already declares it);
- excludes deleted docs from reads by default via query middleware on `find`,
  `findOne`, `findOneAndUpdate`, `findOneAndDelete`, `countDocuments`, and
  `exists`;
- opt-in escape hatch: `.setOptions({ withDeleted: true })`;
- instance methods `softDelete()` / `restore()` and statics
  `softDeleteById()` / `restoreById()` / `softDeleteMany()`. Mongoose does not
  propagate `schema.statics` into the model type, so call sites opt in with
  `asSoftDeleteModel(Model).softDeleteById(id)` (no `declare module` augmentation
  — that corrupted `mongoose.Model`'s generics).

Mongoose 9 note: query middleware runs **synchronously without a `next`
callback**, so the exclusion hook is a plain function.

Known gap (Stage 2): `aggregate` and `distinct` are **not** filtered yet. No
current app code uses them on these models, but the recycle-bin and any future
aggregations must filter `deletedAt: null` explicitly.

`{ deletedAt: null }` matches both `null` and missing, so **no backfill is
required** for existing rows (the migration script still stamps them for
cleanliness).

### 2. Apply to models

`Property`, `Unit`, `Tenant`, `Lease`, `Invoice`, `PropertyType`.

`User` (custodian) keeps its current deactivate-and-unlink semantics — it is an
account, not a domain record; revisit separately.

### 3. DELETE endpoints

- `Unit` → `softDeleteById()` (keep occupied guard).
- `Lease` → `softDeleteById()` (keep invoiced guard).
- `Tenant` → `softDeleteById()`.
- `Invoice` → `softDeleteById()` (keep draft-only guard).
- `Property` → `softDeleteById()` + cascade `Unit.softDeleteMany({ propertyId })`
  (keep tenants-referencing guard).
- Response bodies keep returning the record `_id` so clients are unaffected.

### 4. Unique indexes (the consequential part)

Partial unique indexes need `deletedAt` in the filter so a soft-deleted row does
not block recreating the same key:

- `Tenant`: `{ propertyId, email }` unique, `partialFilterExpression: { deletedAt: null }`
- `Invoice.invoiceNumber`: unique, `partialFilterExpression: { deletedAt: null }`
- `PropertyType.key`: unique, `partialFilterExpression: { deletedAt: null }`
- `Unit`: `{ blockId, name }` unique, `partialFilterExpression: { deletedAt: null }`
- `Lease`: `{ tenantId }` unique where `status: "active"` and `deletedAt: null`
  (explicit index name `lease_active_tenant_unique` to avoid colliding with the
  plain `tenantId_1` lookup index)
- `Invoice {leaseId, period}`: unique where `leaseId: { $gt: "" }` and
  `deletedAt: null`

MongoDB note: `partialFilterExpression` does **not** support `$ne`. The old
`{ leaseId: { $ne: "" } }` filter was invalid and has been replaced with
`{ leaseId: { $gt: "" } }`.

Mongoose `autoIndex` covers dev/fresh DBs. Production runs the one-off
`scripts/migrate-soft-delete-indexes.ts` (backfill `deletedAt: null`, then
`syncIndexes()` per collection) — same pattern as the existing `scripts/*`
backfills.

### 5. Recycle-bin API (system-admin only) ✅

Permission: `recycle-bin:manage` (system-admin only, like `property-type:manage`).
Helpers live in `src/lib/recycle-bin.ts` (type→model registry).

- `GET /api/v1/recycle-bin` — soft-deleted counts per type.
- `GET /api/v1/recycle-bin?type=<type>` — paginated list of that type's deleted
  records, newest first. Types: `property`, `unit`, `tenant`, `lease`, `invoice`,
  `propertytype`.
- `POST /api/v1/recycle-bin/:type/:id/restore` — restore.
- `DELETE /api/v1/recycle-bin/:type/:id` — permanent purge.

Deleted reads bypass the default filter with `.setOptions({ withDeleted: true })`
and filter `{ deletedAt: { $ne: null } }`. Purge only matches records that are
already soft-deleted (a live record can never be purged here). Restoring or
purging a **property** also restores/purges its soft-deleted **units**, mirroring
the delete cascade.

### 6. Recycle-bin UI — system-admin (`/dashboard/system-admin/recycle-bin`)

Client-safe type metadata (`RECYCLE_BIN_TYPES`, `RECYCLE_BIN_TYPE_LABELS`,
`isRecycleBinType`) lives in `src/lib/recycle-bin-types.ts` so browser code never
imports the model-bearing `src/lib/recycle-bin.ts` (which re-exports them).

- `src/hooks/use-recycle-bin.ts` — `useRecycleBinCounts`, `useRecycleBinRecords`,
  `useRecycleBinMutations` (same fetch/refetch pattern as `use-caretakers`).
- `src/components/admin/RecycleBinManager.tsx` — per-type tabs with deleted
  counts, a paginated list, and Restore / destructive Purge actions (purge behind
  an `AlertDialog` confirm). Mutations refresh the list and counts.
- `src/app/dashboard/system-admin/recycle-bin/page.tsx` — `DashboardShell` page.
- Nav entry added to `systemAdminNav` in `src/config/dashboardNav.ts`.

## Test impact

`src/test/utils/model-mocks.ts` gained `updateOne`, `updateMany`,
`softDeleteById`, `softDeleteMany`, and `restoreById` stubs. Five route test
files (`units`, `leases`, `properties`, `tenants`, `invoices` `[id]`) assert the
soft-delete calls; a new `src/lib/mongoose-soft-delete.test.ts` covers the
plugin's read filtering and helpers using native-collection stubs (no DB).

## Staging

- **Stage 1 (data layer):** plugin, models, index changes, DELETE endpoints, tests. ✅
- **Stage 2 (recycle-bin API):** list / restore / purge. ✅
- **Stage 3 (UI):** system-admin recycle-bin page + nav. ✅
