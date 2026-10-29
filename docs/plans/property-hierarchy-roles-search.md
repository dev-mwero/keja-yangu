# Keja Yangu — Property types, block/floor/unit hierarchy, roles & dashboard search

Status: **SUPERSEDED IN PART** — property types, the block/floor/unit hierarchy,
and the custodian role/dashboard all shipped piecemeal (see §10 reconciliation).
Owner: Orchestrix (workflow governor).

> Planning note: the four Tier 1 agents (@code-analyst, @performance-engineer,
> @devops-engineer, @test-engineer) could not be dispatched — the subagent
> infrastructure returned `Insufficient account funds` on every call. Orchestrix
> performed the four analyses directly as a fallback and flagged the decisions
> that must be ratified by Tier 2 before Phase 3 (build) begins.

---

## 1. Requested changes

| # | Change |
|---|--------|
| 1 | Property types become **apartment, villa, bungalow** |
| 2 | Physical hierarchy: **Property → Blocks (named) → Floors → Units**; units named floor digit + letter (e.g. `3A`) |
| 3 | Roles: **system-admin, owner, custodian (new), caretaker, tenant** with scoped powers |
| 4 | Amenities: **predefined pickable list + custom entry** |
| 5 | Property creation captures **blocks (names), floors per block, units per floor** |
| 6 | **Search bar on every dashboard** |

---

## 2. Current state (verified)

- Next.js 16 App Router, TypeScript strict, Tailwind v4, Radix/shadcn, MongoDB + Mongoose, JWT cookie auth, React Hook Form + Zod, Vitest + RTL. ~35.5k LOC, 64 test files.
- **`Property` is flat** (`src/models/Property.ts`): `type` enum `room | apartment | building`, `ownerId`, `caretakerIds[]`, `amenities: string[]`, `beds/baths/area`, `published`. **No block/floor/unit concepts exist anywhere** (confirmed by search).
- **`User`** role enum `tenant | caretaker | owner | system-admin`; `privileges: string[]`, `managedByOwnerId`. No `custodian`.
- **Central RBAC** in `src/lib/permissions.ts`: `Role`, `Action`, `CARETAKER_PRIVILEGES`, `requirePermission(request, action, {resource:{ownerId,caretakerIds}})`, `getTenantScope`, `tenantMatchesScope`, `isFullControlRole` (owner | system-admin).
- **Cross-references to a property** (all use `propertyId: string`): `Tenant`, `Lease`, `Invoice`, `Payment`, `Complaint`, `Announcement`, `PropertyDocument`, `ChatThread`.
- **`propertyId` enum/type literals are duplicated** in: `src/models/Property.ts`, both property routes, `src/hooks/use-properties.tsx`, `src/components/dialogs/PropertyDialog.tsx`, `src/data/properties.ts`, `src/test/utils/factories.ts`, `src/app/properties/page.tsx`, `src/app/dashboard/system-admin/page.tsx`, `src/app/dashboard/owner/page.tsx`, `src/app/dashboard/owner/reports/page.tsx`, and several tests.
- **Nav/roles hard-coded** in `src/config/dashboardNav.ts` (`Role` union, `buildDashboardNav`, `ownerNav`, `caretakerNav`, `systemAdminNav`, `tenantNav`), `src/components/AuthGuard.tsx`, `src/app/api/auth/route.ts` (`role: z.enum(["tenant","caretaker","owner"])`), `src/app/api/auth/me/route.ts`, `src/hooks/use-auth.tsx`, `src/app/auth/page.tsx`.
- `DashboardShell` (`src/components/DashboardShell.tsx`) has **no search bar**.
- CI (`.github/workflows/ci.yml`): biome check, typecheck, build, test on push to `dev`/`main`; deploy job is a placeholder. Docker/Compose exist; migrations are one-off `tsx` scripts in `scripts/`.

---

## 3. Tier 1 synthesis

### 3a. Code analysis (existing patterns & affected surfaces)

**Patterns to follow**
- Models: `InferSchemaType` + `models.X || model(...)`, explicit indexes after schema.
- API: `z.object` validation, `{ data }` / `{ error }` JSON shapes, `requirePermission` before mutation, 400/401/403/404/409 conventions, `parsePagination`/`buildPaginationResult`.
- Hooks: `"use client"`, fetch + cancel-on-unmount + `refetch` on window focus; mutation hooks expose `pending`.
- Schemas: `src/lib/schemas/*` re-exported from `src/lib/schemas/index.ts`.
- Nav config drives dashboards; `DashboardShell({ roleName, nav, title, subtitle, children })`.

**Affected surfaces (grouped)**
- *Data*: `src/models/{Property,User,Tenant,Lease,Invoice,Payment,Complaint,Announcement,PropertyDocument,ChatThread}.ts`; new `Unit.ts`, `MoveRequest.ts`.
- *Domain*: `src/lib/domain-enums.ts` (add property-type + unit enums), new `src/lib/unit-naming.ts`, new `src/lib/amenities.ts`; `src/lib/permissions.ts`.
- *API*: `src/app/api/v1/properties/route.ts`, `.../[id]/route.ts`; new `units` routes, `custodians`, `move-requests`, `search`; `src/app/api/auth/route.ts`, `auth/me/route.ts`, `users/search/route.ts`.
- *Hooks*: `use-properties`, `use-caretakers` (→ generalize to `use-staff`), new `use-units`, `use-move-requests`, `use-search`; `use-auth`.
- *Components/pages*: `PropertyDialog` (→ wizard), new `AmenityPicker`, `UnitStructureEditor`, `SearchBar`; `DashboardShell`; all four dashboard trees; `src/data/properties.ts`; `src/config/dashboardNav.ts`.
- *Tests/factories*: `src/test/utils/factories.ts`, `permissions.test.ts`, `PropertyDialog.test.tsx`, `properties/route.test.ts`, etc.

**Risks/unknowns**
- Only one `ownerId` per property today — owner↔custodian/caretaker scoping reuses `managedByOwnerId`; multi-owner co-ownership is out of scope.
- Changing `type` breaks existing stored values (`room`, `building`) and every duplicated union.
- `Tenant` has a **unique index** `{ propertyId, email }` — once units exist this must become `{ unitId, email }` or similar or multi-unit tenants collide.
- Public listings filter on flat `published` + `status`.

### 3b. Performance analysis

- **Embed vs separate**: blocks and floors are tiny (< a few hundred entries); embedding them in `Property` is safe (Mongo 16 MB cap is far away). **Units must be a separate collection** — they are numerous (potentially 1k+/property), are independently mutated (status/rent/occupancy), and are referenced by leases/invoices.
- **Indexes**: `Unit { propertyId, name }` unique; `Unit { propertyId, status }`; `Unit { ownerId, status }`; `Unit { blockId, floorLevel }`; add `unitId` indexes to `Tenant`/`Lease`/`Invoice` as those gain units.
- **Bulk unit generation**: use `insertMany` with `ordered:false`; cap units per request (recommend ≤ 2,000) and per property; compute names server-side to guarantee uniqueness; make the create+generate flow idempotent via a client `idempotencyKey` or by rejecting duplicate `(propertyId, name)`.
- **Occupancy stats**: compute server-side (aggregation) rather than fetching all units client-side once unit counts grow.
- **Search**: must be **debounced (250–300 ms) + AbortController**, server-side and role-scoped, with a short result cap. Client-side filtering only for small already-loaded lists.

### 3c. DevOps analysis

- **Migration strategy**: Mongoose enum changes do not validate existing docs; new writes enforce the new enum. Provide an idempotent backfill script (`scripts/migrate-property-types.ts`) mapping legacy values, plus `scripts/backfill-units.ts` for hierarchy. Both support `--dry-run`. Never auto-run migrations on app boot.
- **CI/CD**: no pipeline change strictly required; optionally add an explicit `migrate` job gated between `test` and `deploy` on `main`. Keep migrations run manually / via a one-shot task.
- **Rollout**: deploy migration first (backwards compatible), then app. During the window, keep accepting legacy `type` values on input and normalizing them server-side.
- **Audit**: permission grants (custodian/caretaker) and bulk unit creation must be logged (who, when, what).

### 3d. Test strategy

- **Unit-test pure logic**: `unit-naming` (`3A`, ground floor, letters past Z → `AA`), amenity dedupe, property-type normalization, `permissions` matrix for `custodian` + caretaker delete restriction.
- **Integration-test routes**: property create with `blocks[]` → generated units; unit listing/scoping; custodian creation/privileges; move-request lifecycle; search scoping.
- **Component-test**: wizard step validation + preview, `AmenityPicker` add-custom, `SearchBar` debounce/results.
- **Migration tests**: fixtures with legacy `room`/`building` and unit-less properties.
- Extend `src/test/utils/factories.ts` (`makeUnit`, custodian role, unit types).

---

## 4. Design proposal

> The items marked **[T2]** affect a cross-system data contract, auth/authz, or an
> irreversible migration and are **Phase 2 triggers**. They are recommendations
> pending ratification by `@principal-architect` / `@database-architect` /
> `@security-expert`. Tier 2 was unreachable during this planning pass.

### 4.1 Property types **[decided]**
- New enum: `apartment | villa | bungalow` in `src/lib/property-types.ts` as the single source of truth; import everywhere instead of re-declaring literals.
- **No legacy mapping** (user decision): `room` and `building` are dropped outright — no `legacyType` field, no backfill script. Existing dev data with those values is not migrated.

### 4.2 Hierarchy: Property → Block → Floor → Unit **[T2]**
- `Property` gains `blocks: Block[]` (embedded subdocs; each gets a subdoc `_id`):
  - `Block { name: string, order: number, floors: Floor[] }`
  - `Floor { level: number, label: string }` (level `0` = ground; `label` for display, e.g. `"Ground"`, `"3"`)
- New `Unit` collection (separate, indexed):
  ```
  Unit {
    propertyId, ownerId,
    blockId, blockName,
    floorId, floorLevel, floorLabel,
    name,        // "3A" / "GA" — unique per BLOCK
    letter,      // "A"
    status: "available" | "occupied" | "maintenance",
    rent?, beds?, baths?, area?,   // rent override or inherited
    tenantId?,   // current occupant (optional)
  }
  ```
  - Unique index `{ blockId, name }` (**per block, not per property**, user decision); indexes `{ propertyId, status }`, `{ ownerId, status }`, `{ blockId, floorLevel }`.
- **Unit naming** (`src/lib/unit-naming.ts`): floor digit + letter. Ground floor defaults to `GA, GB, …`; floors ≥1 use the level, e.g. `3A, 3B`. Letters go `A…Z, AA, AB…` for >26 units/floor. **Naming is overridable**: the in-charge (owner/custodian/caretaker with `manage_units`) may supply custom unit names per floor (and rename individual units). Server is the source of truth; the wizard previews using the same function.
- **Rent inheritance** (user decision): units share the property rent **unless overridden at block level, floor level, or unit level**. Resolution order: `unit.rent ?? floor.rentOverride ?? block.rentOverride ?? property.price`. Store `rentOverride` on Block and Floor, and `rent` on Unit; all nullable.
- **References**: add optional `unitId` to `Tenant`, `Lease`, `Invoice`, `Payment`, `Complaint`, `Announcement`, `PropertyDocument`; keep `propertyId` for back-compat and for portfolio/property-wide records (`propertyId: ""` still means portfolio-wide on Announcements). New leases/tenants **require** `unitId`; legacy rows remain valid.
- **Tenant uniqueness**: change the `{ propertyId, email }` unique index to `{ unitId, email }` (with `propertyId` retained) so a person can hold units in multiple properties/blocks. **[T2 — index/migration]**

### 4.3 Roles & permissions **[T2 — authz]**
- Add `custodian` to `User.role` enum and to `Role` in `src/lib/permissions.ts`.
- **Scoping model**: a custodian is an owner-delegate bound via `managedByOwnerId`. `requirePermission` gains a custodian branch that mirrors the owner branch but scopes every resource check to `resource.ownerId === user.managedByOwnerId`. `isFullControlRole` stays owner|system-admin; add `isOwnerScopedRole(role) => owner || custodian`.
- **Custodian powers** (owner-delegated): manage properties, caretakers, and tenants for their owner. Cannot manage other owners, cannot grant system-admin, cannot delete an owner.
- **Caretaker**: keep additive privileges; explicitly ensure **delete is privilege-gated** (`delete_assigned_property`) while add/update are the defaults when granted `create_property`/`edit_property`/`manage_units`. Add privileges `manage_units`, `process_move_requests`.
- **Move-in/move-out requests**: new `MoveRequest` model + routes.
  ```
  MoveRequest { tenantId, userId, propertyId, unitId, type: "move-in"|"move-out",
                status: "pending"|"approved"|"rejected"|"cancelled",
                note?, decidedBy?, decidedAt?, fromLeaseId?, toLeaseId? }
  ```
  Tenant creates; owner/custodian (and caretaker with `process_move_requests`) decides; approval creates/ends the `Lease` and flips `Unit.status`/`Unit.tenantId`.
- **Onboarding**: `custodian` is invite/owner-assigned only (not a public signup role), mirroring `caretaker`/`system-admin`. New `/api/v1/custodians` (+ privileges) mirroring `/api/v1/caretakers`.
- **Dashboards**: add `/dashboard/custodian/*` (owner-like nav minus portfolio ownership), `custodianNav`, AuthGuard handling, `use-auth` role union updates.

### 4.4 Amenities picker
- `src/lib/amenities.ts`: `AMENITY_OPTIONS: { id, label, category? }[]` (e.g. Swimming Pool, Basketball Court, Gym, Lift, Parking, Backup Power, Backup Water, Security 24/7, CCTV, Garden, Balcony, Concierge, Wi-Fi). Seeded constant — no DB needed.
- New `AmenityPicker` component: predefined chips + "Add custom…" input; dedupes case-insensitively; stores `string[]` (labels) to stay compatible with the existing `amenities: string[]` field.
- Optional (defer): persist custom amenities to a platform `Amenity` registry so they are reusable platform-wide.

### 4.5 Property creation wizard
- Replace `PropertyDialog` with a **multi-step wizard** (`PropertyWizard`) reusing the existing form field set:
  1. **Basics** — title, type (apartment/villa/bungalow), location, price, beds/baths/area, description, images.
  2. **Amenities** — `AmenityPicker`.
  3. **Structure** — add named blocks; per block set floor count and units per floor; live unit-name preview + total count; validation (unique block names, ≥1 floor, ≥1 unit).
  4. **Assign & publish** — caretakers/custodians, published toggle, (system-admin) target owner.
- `POST /api/v1/properties` accepts an optional `blocks` payload; the server creates the property and bulk-inserts units (idempotent, capped). Editing structure later uses `PATCH /api/v1/properties/[id]/structure` which only ever adds units (never silently deletes occupied ones).
- Keep the simple form reachable for legacy/quick edits; wizard is the default for create.

### 4.6 Dashboard search
- Add a shared `SearchBar` into `DashboardShell`'s header (desktop + mobile sheet), so it appears on **every** dashboard page.
- New `GET /api/v1/search?q=&limit=` returning grouped, **role-scoped** results (`properties`, `units`, `tenants`, `leases`, `invoices`, `staff`) using the existing scope helpers. Min 2 chars, 250–300 ms debounce client-side, `AbortController`, result cap, rate-limited.
- Per-dashboard tables may additionally add local column filters (reuse the same matching helper).

---

## 5. Affected surfaces checklist

**New files**
- Models: `src/models/Unit.ts`, `src/models/MoveRequest.ts` (optional `src/models/Amenity.ts`)
- Domain/util: `src/lib/unit-naming.ts`, `src/lib/amenities.ts`, `src/lib/property-types.ts`
- Schemas: `src/lib/schemas/unit.ts`, `.../move-request.ts`, `.../structure.ts`
- API: `src/app/api/v1/properties/[id]/structure/route.ts`, `src/app/api/v1/units/route.ts`, `src/app/api/v1/units/[id]/route.ts`, `src/app/api/v1/custodians/route.ts`, `src/app/api/v1/custodians/[id]/privileges/route.ts`, `src/app/api/v1/move-requests/route.ts`, `src/app/api/v1/move-requests/[id]/route.ts`, `src/app/api/v1/search/route.ts`
- Hooks: `src/hooks/use-units.tsx`, `use-move-requests.tsx`, `use-search.tsx`
- Components: `src/components/dialogs/PropertyWizard.tsx`, `src/components/property/AmenityPicker.tsx`, `src/components/property/UnitStructureEditor.tsx`, `src/components/SearchBar.tsx`, `src/components/team/CustodianPrivilegesTable.tsx`
- Pages: `src/app/dashboard/custodian/**`
- Scripts: `scripts/migrate-property-types.ts`, `scripts/backfill-units.ts`

**Modified files (key)**
- `src/models/{Property,User,Tenant,Lease,Invoice,Payment,Complaint,Announcement,PropertyDocument,ChatThread}.ts`
- `src/lib/permissions.ts`, `src/lib/domain-enums.ts`, `src/lib/schemas/index.ts`
- `src/app/api/v1/properties/{route.ts,[id]/route.ts}`, `src/app/api/auth/{route.ts,me/route.ts}`, `src/app/api/v1/users/search/route.ts`
- `src/hooks/{use-properties,use-caretakers,use-auth,use-caretaker-nav}.tsx`
- `src/config/dashboardNav.ts`, `src/components/DashboardShell.tsx`, `src/components/AuthGuard.tsx`
- `src/data/properties.ts`, `src/app/properties/page.tsx`, `src/app/dashboard/{owner,system-admin}/page.tsx`, `src/app/dashboard/owner/reports/page.tsx`, `src/app/auth/page.tsx`
- `src/test/utils/factories.ts` + existing tests referencing the type union/roles
- `README.md`, `.env.example` (if new config), `docs/`

---

## 6. Phased delivery plan (Phase 3 build — after ratification)

Dependency-ordered; each step is independently verifiable and commit-able.

| Phase | Step | Depends on | Suggested commit |
|-------|------|-----------|------------------|
| A | Single-source enums + `property-types.ts` normalizer; `amenities.ts`; `unit-naming.ts` tests | — | `feat(domain): add property-type, amenity and unit-naming primitives` |
| A | Extend `factories.ts`; add `makeUnit`, custodian factory | A1 | `test(factories): add unit and custodian fixtures` |
| B | Property `type` enum switched to apartment/villa/bungalow (no legacy mapping) | A | `feat(properties): switch property types to apartment/villa/bungalow` |
| C | `Unit` model + indexes; Property `blocks[]`/`floors[]` schema (rent overrides) | A | `feat(properties): add block/floor/unit hierarchy model` |
| C | `blocks` create payload + bulk unit generation (idempotent, capped) + route tests | C1 | `feat(properties): generate units from block/floor structure` |
| C | `GET/PATCH` unit routes + scoping + tests | C1 | `feat(units): add scoped unit read/update APIs` |
| C | `PropertyWizard` + `UnitStructureEditor` + tests | C2,C3 | `feat(properties): multi-step create wizard with structure builder` |
| D | `custodian` role in User/permissions + scoped branch + tests | A | `feat(auth): add owner-scoped custodian role` |
| D | `/api/v1/custodians` + privileges + `CustodianPrivilegesTable` | D1 | `feat(custodians): manage custodians and privileges` |
| D | `custodian` dashboard tree + nav + AuthGuard | D1 | `feat(dashboard): add custodian dashboard` |
| D | `MoveRequest` model + routes + approval→lease/unit effects | C1,D1 | `feat(tenancy): tenant move-in/out requests` |
| E | `AmenityPicker` wired into wizard + detail page + tests | C4 | `feat(properties): predefined + custom amenity picker` |
| F | `SearchBar` in `DashboardShell` + `/api/v1/search` + tests | — | `feat(dashboard): global role-scoped search bar` |
| G | README/docs update | — | `docs: document hierarchy, roles and search` |

Build routing: hierarchy/wizard/RBAC/search are cross-cutting → `@developer-prime`. Boilerplate (constant lists, nav entries, simple zod schemas) → `@developer-fast`. Independent phases (B, E, F) can run in parallel; D depends on A/C.

---

## 7. Migration & rollout
- **No legacy type mapping** (user decision). Switching the enum is a straight swap; existing dev rows with `room`/`building` are not migrated.
- Hierarchy is additive: new properties carry `blocks[]`/`floors[]` + generated `Unit` docs; legacy properties may remain unit-less.
- Backwards compatibility: `propertyId` stays on all referencing models; `unitId` nullable.
- Rollback: unit creation is additive and idempotent.

## 8. Test strategy summary
- Unit: `unit-naming` (ground `GA`, floors `3A`, custom names, letters past Z), `amenities` dedupe, property-type enum, `permissions.test.ts` (custodian + caretaker delete).
- Integration: property create with structure → units; unit scoping; custodian CRUD/privileges; move-request lifecycle; search scoping.
- Component: wizard validation + live preview; `AmenityPicker`; `SearchBar` debounce.
- Commands: `npm run test`, `typecheck`, `biome check` (CI parity).

## 9. Phase 2 triggers (Tier 2 unreachable — documented, not ratified)
| Trigger | Agent | Decision |
|---|---|---|
| Cross-model data contract (`unitId` on Tenant/Lease/Invoice/Payment) | `@principal-architect` | Reference unit vs property; compat |
| Schema/index/migration | `@database-architect` | Embedded blocks/floors; `{blockId,name}` unique index |
| New role + authz model | `@security-expert` | Custodian scoping, escalation guards, audit |

## 10. Resolved decisions (from user)
1. **Legacy mapping: removed** — no `legacyType`, no backfill.
2. **Ground floor naming**: `GA, GB, …`; other floors `3A, 3B, …`; custom naming allowed by the in-charge.
3. **Unit-name uniqueness**: **per block** (`{ blockId, name }`), not per property.
4. **Rent**: one rent per property, overridable at **block → floor → unit** level.
5. Custodian count per owner: many custodians allowed, owner-scoped (no per-property restriction for v1).
6. Search scope: properties, units, tenants, leases, invoices, staff (role-scoped).
7. Legacy/unit-less properties: allowed to remain unit-less (no forced backfill).

## 11. Status reconciliation (verified against shipped code)

**Shipped (superseded):**
- Property types: `apartment | villa | bungalow` enum is the single source of truth
  (`src/lib/property-types.ts`); `Property.type` defaults to `apartment`
  (`src/models/Property.ts`).
- Block/floor/unit hierarchy: `Property.blocks[].floors[]` (embedded subdocs with
  `level`/`label`) plus the separate `Unit` collection, all CRUD and reconciliation
  routes, and the structure editor wizard — shipped.
- Custodian role: `custodian` in `User.role` enum, owner-scoped via `managedByOwnerId`,
  `/api/v1/custodians` + privileges, `/dashboard/custodian/*` tree and nav — shipped.
- Custodian adopts pre-created inactive accounts via the verify-email flow
  (`POST /api/auth {action:"verify-email"}`) — shipped.

**Still outstanding (the only live residuals):**
- Amenities remain a free-text `string[]` (`Property.ts`) with **no predefined
  pickable list** / `AmenityPicker` (plan §4.4).
- **No dashboard search bar** — `DashboardShell`/`DashboardNav` contain no search
  (plan §4.6, §6/F).

**Deferred (intentionally, not regressions):**
- `ChatThread.unitId` — intentionally deferred from `simplify-user-flows` Phase 6.
- Tenant index change `{propertyId, email}` → `{unitId, email}` (§4.2) — depends on
  unit-backed tenancies being universally adopted.
