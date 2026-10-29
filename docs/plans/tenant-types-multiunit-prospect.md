# Keja Yangu — Tenant types, multi-unit tenancy & prospect/lead lifecycle

**Status:** Proposed (for implementation later)  
**Author:** Planner (inline)  
**Related:** `docs/plans/simplify-user-flows/` (Phases 1–6 already shipped)

---

## 1. Goal

Introduce three tenant **types**, support one tenant holding **multiple units**, and formalise a **prospect/lead** stage that lasts until the person moves into a unit. All three changes are additive where possible; the multi-unit change is the only one that alters existing data shape.

---

## 2. Tenant types

Add a `type` field to the `Tenant` model:

| Value | Meaning | Pays rent? | Notes |
|-------|---------|------------|-------|
| `residential` | Lives in the unit | Yes | Default for most tenants |
| `commercial` | Office / shop / workspace | Yes | Same billing as residential, different label |
| `owning` | Purchased unit(s), manages them | **No** | Owner-occupier tracked as a tenant/contact; no rent invoices |

**Design**
- `tenant.type` = `"residential" \| "commercial" \| "owning"`, default `"residential"`.
- Invoice generation (`src/lib/invoice-generation.ts` / `POST /api/v1/invoices/generate`) must **skip** `owning` tenants (they do not pay rent).
- Complaints/chat/requests work the same for all three types.
- `owning` tenants should still be able to log in (phone/email) and use the tenant dashboard.

**Open question (to resolve at implementation):** Does `type` belong on `Tenant` only, or should `Lease`/`Unit` also carry it? Recommendation: keep it on `Tenant` only.

---

## 3. Multi-unit tenancy (one tenant → many units)

Today `Unit.tenantId` is a **single** reference (one unit → one tenant). Change it to support multiple units per tenant.

**Chosen approach (per user decision):** `Unit.tenantId` becomes an **array** of tenant references.

```
Unit.tenantId: [tenantId]   // was: single tenantId
```

**Implications to handle**
- Vacancy check: a unit is "vacant" when `tenantId` is empty `[]`, not when `tenantId === null`.
- Occupancy allocation: `allocateUnit` pushes to `tenantId` instead of setting it; `vacateUnit` removes the specific tenant (or clears the array when the last one leaves).
- The "My Home" view (`tenant/home/page.tsx`) currently finds **one** occupied unit — it must now list all units where the tenant is in `tenantId`.
- Tenant detail page should list all assigned units.
- Guards: `DELETE /units/:id` still blocked while occupied (any tenant in the array).

**Alternative not taken:** a `TenantUnit` join table. Rejected per user preference for `tenantId` as array. Revisit if per-unit rent/dates diverge per tenant.

---

## 4. Prospect / lead until move-in

**Chosen approach (per user decision):** A prospect/lead is a **lightweight lead record** (name, phone, email) — **no User account, no password** — until they move in.

**Lifecycle**
```
prospect/lead  →  (manager approves)  →  allocated to unit  →  moved in  →  tenant
                                                        (unit.tenantId includes them,
                                                         active lease)
                                                         ↳ create User + Tenant row here
```

**Where it fits**
- This is essentially the existing "prospect picks unit → manager approves → allocate" flow from `docs/plans/simplify-user-flows` (Phases 1–3, shipped). The new piece is explicitly naming the pre-move-in state "prospect/lead" and deferring User creation until move-in.
- A lead record holds: name, phone (required), email (optional), interested property/unit(s), status (`new`/`contacted`/`approved`/`rejected`/`converted`), source, notes, createdBy.
- On move-in conversion: create the `Tenant` row (and, if desired, a `User` account with phone/email per existing phone-login work). Do **not** create a User at lead time.

**Open question:** Should converting a lead automatically create a `User` account (with out-of-band shared password per phone-login work), or only create the `Tenant` row and let them sign up later? Recommendation: create the `Tenant` row at conversion; create `User` only when they first sign in (existing invite/link flow handles this).

---

## 5. Files likely to change

- `src/models/Tenant.ts` — add `type` field
- `src/models/Unit.ts` — change `tenantId` to array
- `src/lib/tenancy.ts` / `src/lib/allocation.ts` — allocate/vacate with array semantics
- `src/lib/invoice-generation.ts` — skip `owning` tenants
- `src/app/api/v1/units/[id]/route.ts` — vacancy/occupancy guards
- `src/app/dashboard/tenant/home/page.tsx` — list all tenant units
- New: `src/models/Lead.ts` (prospect/lead record) — optional, if not reusing `Application`
- New: lead CRUD API (`POST /api/v1/leads`, `GET /api/v1/leads`, decide) — optional

---

## 6. Verification checklist (at implementation)

- [ ] `npx tsc --noEmit` clean
- [ ] `npx biome check` clean on changed files
- [ ] `npx vitest run` — all existing tests pass (1361 currently)
- [ ] A tenant can be assigned to two units and see both in "My Home"
- [ ] An `owning` tenant produces no invoices in monthly generation
- [ ] A unit with `tenantId: []` shows as vacant; with one tenant, occupied
- [ ] Lead → tenant conversion works end-to-end

---

## 7. Decision log

| Decision | Chosen | Source |
|----------|--------|--------|
| Tenant types | residential / commercial / owning on `Tenant.type` | User request |
| Multi-unit | `Unit.tenantId` as array | User request |
| Prospect = lead | Lightweight record (name/phone/email), no User account | User request |
| Lead→tenant User creation | Defer User; create Tenant row at conversion | Recommended (open) |
| `type` on Lease/Unit | Not now; keep on Tenant only | Recommended (open) |
