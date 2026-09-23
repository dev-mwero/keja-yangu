# Keja Yangu — Rental Invoicing (Lease + Invoice engine)

## 1. Summary

Build the durable invoicing layer for Keja Yangu: a `Lease` model (who rents what at
what rent) and an `Invoice` model with a monthly auto-generation engine, real
CRUD/status APIs, and replacement of the six mock/localStorage payment surfaces with
real data. Payment recording is status-only manual (pending/paid/overdue, mark-paid
offline) — **no Paystack/gateway yet**; the models and `amountPaid` field are shaped
to accept Paystack later. Owners and system-admin get full control; a new
`manage_invoices` caretaker privilege (scoped to assigned properties) is added; a
tenant sees only their own invoices via a new `Tenant.userId` link.

This feature is planned to build **on top of** `.opencode/plans/property-management.md`
(assumed already implemented): `Tenant` model, `src/lib/permissions.ts`
(`authenticate`/`requireRole`/`requirePermission`), `system-admin` role, owner-scoped
reads (404 foreign reads / 403 foreign mutations), plain 24-hex string ids, and the
test infrastructure (`api-request`, `model-mocks`, `factories`, `permission-matrix`,
`render-with-auth`).

## 2. Scope

### In scope
- `Lease` model + `/api/v1/leases` + `[id]` CRUD (owner/system-admin only; owner
  scoped, admin all).
- `Invoice` model + `/api/v1/invoices` + `[id]` with `mark-paid` and `void`
  sub-routes, `POST /api/v1/invoices/generate`, and `/api/v1/tenant/me/invoices`
  (tenant sees own).
- Monthly auto-generation per active lease, idempotent via `{ leaseId, period }`
  unique index + find-before-insert; on-demand trigger (no cron infra).
- Invoice numbering via per-owner atomic counter (`INV-YYYYMM-NNNN`).
- `overdue` derived at read time (never persisted); status enum
  `draft | pending | paid | void`.
- Extend the property-management privilege enum **pre-implementation** with
  `manage_invoices` (5th privilege, folded into property-management's build).
- `Tenant.userId` optional link (tenant→User) for tenant-owned invoice reads, with
  signup-time binding + backfill.
- Replace mock `invoicesStore`/`paymentsStore` consumers: owner & caretaker
  accounting, owner & caretaker reports, tenant payments, tenant reports.
- Manual offline mark-paid by owner/system-admin/caretaker-with-priv **and tenant
  (own invoices only)**; audited via `paidBy`/`paidByRole`/`paidAt`.
- Backfill script + README/sitemap updates + tests.

### Out of scope
- Paystack/gateway integration, payment verification, webhooks, auto-pay.
- Cron/scheduled generation (no infra exists; on-demand + page sweep instead).
- Lease handling for caretakers (leases are owner/admin-only commitments).
- Tenant lease CRUD; tenant "Pay now" beyond mark-paid.
- Tenant auto-pay toggle (currently fiction in the mock — removed).
- Invoicing export as PDF (receipt uses `window.print()`).
- Re-writing other localStorage stores (tasks, complaints, announcements, etc.).
- Renumbering/referencing of the property-management plan's decisions (no collision:
  `leases`/`invoices`/`tenant/me` are fresh namespaces).

## 3. Architecture

```
Owner/Admin/Caretaker(priv)/Tenant UIs
   │  useInvoices / useLeases / useMyInvoices hooks (swp: generate on mount for staff pages)
   ▼
API: /api/v1/leases(/:id)  /api/v1/invoices(/:id, mark-paid, void, generate)
     /api/v1/tenant/me/invoices(/:id)
   │  each: authenticate → requirePermission(action, {resource?, ctx?}) → scope query → zod → service → DB
   ▼
src/lib/permissions.ts (reused)      src/lib/invoicing.ts (serializeInvoice, deriveStatus,
   + actions lease:manage,             state machine)   src/lib/invoice-numbering.ts (counter)
     invoice:read/manage/mark-paid/     src/lib/invoice-generation.ts (pure per-lease builder +
     generate, invoice:read-own         generateForPeriod orchestrator)
   ▼
src/models/Lease.ts (ownerId denorm)    src/models/Invoice.ts (ownerId denorm, amountPaid)
   ▼
src/models/User.ts += invoiceCounters   src/models/Tenant.ts += userId?
```

**Invariants**
- DB is the authz source of truth (per property-management): User doc re-read each
  call; `isActive` enforced; JWT identity-only.
- `Lease.ownerId` derived from `Property.ownerId`; `Invoice.ownerId` from
  `lease.ownerId` (generated) or `Tenant.ownerId` (manual). Never client-supplied.
- 404 on foreign reads, 403 on foreign mutations, 400 malformed id, 409 state/ref
  conflicts (delete draft-only; delete lease blocked while invoices reference it).
- Idempotent generation: `{ leaseId, period }` unique; re-run returns
  `{ created: 0, skipped: n }` (200), never double-invoices, never mutates existing
  invoices (`$setOnInsert`).
- Money in whole KES units; `formatKES` displays; `amountPaid` kept for Paystack
  later (v1 mark-paid sets `amountPaid = amountDue` server-side).
- Periods are UTC calendar months (`"YYYY-MM"`); `dueDate = 5th of next month`.
- Overdue derived: `serializeInvoice(doc, now)` maps stored `pending` +
  `dueDate < now` → `"overdue"`. Persisted enum never contains `overdue`.

## 4. What to do

1. **Pre-step (fold into property-management build):** extend the privilege enum to
   `["create_property","edit_property","delete_assigned_property","manage_tenants","manage_invoices"]`
   — update the property-management plan's `privilegeInput` schema, permission-matrix
   fixture, and team-page spec (5th switch) atomically *before* that plan lands.
2. **`src/models/Lease.ts`** — `{ tenantId (req string), propertyId (req string),
   ownerId (req, denorm from Property at create), rentAmount (req, min 0),
   frequency enum ["monthly"] default "monthly", startDate (Date.req), endDate?,
   status enum ["active","ended"] default "active", notes? }` + timestamps. Indexes:
   `{ ownerId }`, `{ tenantId }`, `{ propertyId }`, partial unique
   `{ tenantId }` filter `{ status: "active" }` (one active lease per tenant; ended
   history allowed). POST validates tenant exists, `status === "active"`, property
   exists and is in actor scope (owner: `tenant.ownerId === self`). system-admin:
   may target any owner's tenant/property. No caretaker access (403). PATCH limited
   to `rentAmount`, `startDate`, `endDate`, `status`, `notes` (identity fields
   stripped). `active → ended` sets `endDate` today if absent. DELETE only when no
   `Invoice.leaseId` references it, else 409.
3. **`src/models/Invoice.ts`** — `{ invoiceNumber (req unique), tenantId (req),
   propertyId (req), leaseId (default ""), ownerId (req), period (req, regex
   ^\d{4}-(0[1-9]|1[0-2])$), amountDue (req min 0), amountPaid (default 0),
   status enum ["draft","pending","paid","void"] default "pending", dueDate (req),
   issuedAt (default now), paidAt?, method? enum
   ["M-Pesa","Card","Bank","Cash","Other"], notes?, paidBy?, paidByRole?, timestamps }`.
   Indexes: `{ ownerId, period }`, `{ tenantId }`, partial unique
   `{ leaseId, period }` filter `{ leaseId: { $ne: "" } }` (generation
   idempotency). Manual create: with `leaseId` → derive tenant/property/owner/amount;
   without → require `tenantId + propertyId`, ownerId from tenant. `status`
   `draft|pending` only at creation.
4. **`src/models/User.ts`** — add `invoiceCounters: Map<String, Number>` default
   `{}` (per-owner per-period sequence, lazy).
5. **`src/models/Tenant.ts`** — add optional `userId: String default ""` + index
   `{ userId }`. `updateMany` binding at signup verify (bind all unbound Tenant rows
   whose `email === verified email`) and via backfill script.
6. **`src/lib/invoicing.ts`** — `periodRange("YYYY-MM")`, `lastDayOf`,
   `computeDueDate(period) = 5th of next month`, `isLeaseActiveForPeriod`,
   `deriveStatus(invoice, now)` (UTC; draft/paid/void never flip), `serializeInvoice`
   (adds derived `overdue`), and centralized state-machine guards
   (draft|pending → paid; void from draft|pending; paid → 409; delete draft only;
   already-void idempotent).
7. **`src/lib/invoice-numbering.ts`** — `nextInvoiceNumber(ownerId, period)`:
   `User.findOneAndUpdate({ _id: ownerId }, { $inc: { ["invoiceCounters." + period]: 1 } },
   { new: true })` → `INV-<YYYYMM>-<NNNN>` 4-digit zero-pad. Unique index on
   `invoiceNumber` backstop (retry once on duplicate key). Both generate and manual
   create use this single path.
8. **`src/lib/invoice-generation.ts`** — pure `buildInvoiceForLease(lease, period, now,
   seq)` + `generateForPeriod({ leases, existing, period, now }) → { toCreate, skipped[] }`
   (skipped = already-generated / ended / future / non-monthly with reason). Route
   orchestrates: scope leases (owner: `Lease.find({ ownerId })`; caretaker w/ priv:
   assigned-property leases of managing owner; admin: all) → filter `startDate <=
   periodEnd` → `insertMany` (or per-doc with counter) → return `{ created, skipped }`.
   `$setOnInsert` guarantees manual edits survive re-runs. Never bill future months
   (future-period request → 400).
9. **`src/lib/schemas/lease.ts` + `invoice.ts`** — strict zod: 24-hex id regexes,
   `rentAmount` positive, period regex, `invoiceGenerateInput` (`period?` +
   future-period rejection), `invoiceMarkPaidInput` (`{ method?, notes? }`, no
   amountPaid), `privilegeInput` extension (5-set).
10. **API routes** (all `authenticate → requirePermission → scope → zod → DB`,
    rate-limited + Origin/Sec-Fetch-Site on writes):
    - `/api/v1/leases` GET/POST, `/api/v1/leases/[id]` GET/PATCH/DELETE
      (`lease:manage`; owner-scoped). 409 delete-with-invoices.
    - `/api/v1/invoices` GET (filters `period|status|tenantId($|propertyId|leaseId`;
      `status=overdue` → derived query `{ status: "pending", dueDate: { $lt: now } }`;
      paginated, sorted `-issuedAt`) and POST (`invoice:manage`).
    - `/api/v1/invoices/[id]` GET/PATCH/DELETE (`invoice:read` / `invoice:manage`).
    - `/api/v1/invoices/[id]/mark-paid` POST (`invoice:mark-paid`; 409 already
      paid/void) and `/api/v1/invoices/[id]/void` POST (`invoice:manage`; terminal).
    - `/api/v1/invoices/generate` POST (`invoice:generate`; scoped per actor).
    - `/api/v1/tenant/me/invoices` GET + `[id]` GET + `[id]/mark-paid` POST
      (`invoice:read-own`; tenant resolves `User → Tenant.find({ userId }) → Invoice
      tenantId $in`; no matching tenant → 200 `[]`; foreign → 404).
    - Confirm static `generate`/`mark-paid`/`void` beat `[id]` routing (static wins in
      Next); add a route test asserting `pathname === "/api/v1/invoices/generate"`.
11. **Hooks** — `src/hooks/use-leases.tsx`, `use-invoices.tsx` (list + mutations +
    **generate-sweep on mount** for staff accounting pages: one no-body
    `POST /generate` then GET), `use-my-invoices.tsx` (tenant), following the
    `useProperties` shape.
12. **UI** — shared `src/components/invoices/` (`InvoicesManager` used by owner +
    caretaker accounting, `InvoiceTable`, `InvoiceFormDialog`, `RecordPaymentDialog`,
    `VoidConfirmDialog`, `GenerateMonthDialog`, `ReceiptDialog` via `window.print()`).
    - **owner/accounting**: replace `useLocalStore(invoicesStore)` with `useInvoices`;
      keep StatCards + `byPeriod` grouping (period "2026-09" sorts/labels fine via new
      `formatPeriod` helper in `src/lib/format.ts`); status tabs; Generate button
      (month picker); create/edit dialogs; record-payment (add "Cash"/"Other" to the
      existing method Select); delete draft; void paid.
    - **caretaker/accounting**: gated on `user.privileges.includes("manage_invoices")`
      → real `useInvoices` (server-scoped); otherwise privilege-gated empty state.
    - **owner/reports** + **caretaker/reports**: real `useInvoices` for
      collected/outstanding (exclude `void`), export, revenue/rent-position sections;
      caretaker hides rent-position card when not privileged; **remove the
      `caretakers.find(email)` identity hack** (use `user.id`/`user.privileges`).
    - **tenant/payments**: real `useMyInvoices`; tabs Upcoming (pending/overdue) /
      History (paid); **drop the auto-pay toggle/tab/StatCard** (fiction, no gateway);
      "Mark paid" affordance **kept for tenant's own invoices** (honor system, server
      stamps `paidByRole: "tenant"`); Receipt via ReceiptDialog.
    - **tenant/reports**: real `useMyInvoices` for paid-in-range, export, status
      breakdown.
13. **Tenant binding** — in `/api/auth/route.ts` verify flow: on tenant-role email
    verification, `Tenant.updateMany({ email: verifiedEmail, userId: "" },
    { $set: { userId } })` (lodged, idempotent, multi-unit safe).
14. **Backfill script** `scripts/backfill-rental-invoicing.ts` (idempotent,
    `npx tsx`): (a) bind tenant users → `Tenant.userId`; (b) optional `--generate`
    flag to run the generator for all active leases.
15. **README + sitemap** — README API table gains the seven new routes + privilege
    mention; sitemap unchanged (no new public URLs; receipts are in-app dialogs).

## 5. What NOT to do

- **Do NOT build Paystack/gateway, webhooks, or auto-pay** in this feature. `amountPaid`
  is the only forward-compat hook. Auto-pay toggle in tenant/payments is removed, not
  wired.
- **Do NOT add a cron/scheduler or `setInterval`** — no worker infra exists; use the
  on-demand generate endpoint + page-load sweep (idempotent by index).
- **Do NOT persist `overdue`** — derive at read (`serializeInvoice`). Stored enum is
  `draft|pending|paid|void` only.
- **Do NOT let caretakers touch leases** (403) — leases are owner/admin commitments.
- **Do NOT let `manage_invoices` caretakers generate portfolio-wide** — generation is
  scoped to their assigned properties (mirrors `manage_tenants` scope); a caretaker is
  never given the owner's full sweep by accident.
- **Do NOT accept client `ownerId`/`tenantId`/`propertyId` reparenting** on Invoice or
  Lease writes — server-derives and strips; on PATCH these fields are forbidden.
- **Do NOT cascade or hard-delete issued/paying invoices** — paid/void immutable;
  delete allowed only on `draft`; paid invoices only void. Never orphan tenant data.
- **Do NOT emulate the tenant email-matching pattern** for invoice reads — use the
  `Tenant.userId` link (email matching is fragile and breaks on verification drift).
- **Do NOT reuse invoice numbers** or derive them from a non-atomic count (races →
  duplicates; deletes → reuse confusion). Counter + unique index only.
- **Do NOT keep generating future months** — reject `period > current month` (400).
- **Do NOT touch the other localStorage stores** (`tasks`, `complaints`, etc.) or
  remove `src/data/dashboard.ts` (`Payment`/`Invoice` types become unused-but-kept;
  public marketing pages still consume other exports).
- **Do NOT split permission logic per route** — re-use `requirePermission` from
  property-management; centralize 404/403 there.
- **Do NOT do double-work:** generation must not call numbering when a doc already
  exists (find-before-insert) and must not update existing docs (`$setOnInsert`).
- **Do NOT test the cron/mongodb-memory-server/Paystack** (none exist).

## 6. Security considerations

### Controls
- Reuse the DB-authoritative authz: every call re-reads the User doc (`role`,
  `isActive`, `privileges`, `managedByOwnerId`); JWT identity-only.
- Invoices are tenant-adjacent financial PII: default caretaker invoice reads → 404
  (hide existence), mutations → 403. Owner-scoped reads (`ownerId === self`);
  system-admin all; caretaker-with-priv scoped to assigned properties where
  `ownerId === managedByOwnerId`.
- Tenant self-mark-paid is an explicit **honor system** (user requirement):
  server-scoped to own invoices and audited via `paidBy` (`userId`) +
  `paidByRole: "tenant"` + `paidAt`. Owner/admin pages remain authoritative for
  reports. Mitigation for abuse: per-endpoint rate limit + a log line on every
  mark-paid; future Paystack verification will make payments non-honorary.
- `Tenant.userId` binding happens only at email verification and only for
  `role === "tenant"` users, matching lowercase email, unbound rows only
  (`userId: ""`) — no silent re-binding of already-linked rows.
- Mutating endpoints: `rateLimit(request, { limit: 20 })` + Sec-Fetch-Site/Origin
  check (per property-management conventions).
- No logging of invoice bodies or email/PII; log only actorId/action/resourceId.

### Forbidden
- No JWT-role-claim authorization; no caretaker lease access; no cross-owner reads
  (404) or mutations (403); no client-controlled identity fields; no financial
  status flip without `paidBy`/`paidAt` audit stamp; no future-month invoice
  generation without an owner-scoped generate action.

## 7. Performance considerations

- Total new indexes: Lease `{ownerId}`/`{tenantId}`/`{propertyId}`/
  `{tenantId}+active-partial`; Invoice `{ownerId,period}`/`{tenantId}`/
  `{leaseId,period}+partial-unique`; User `invoiceCounters` (embedded map, no index);
  Tenant `{userId}`. All cheap at this data size.
- Generation cost: single `Lease.find({ownerId})` + one upsert-ish insert per active
  lease-month; idempotent index prevents duplicate races. Two-run verification in
  tests asserts `created: 0` on second run.
- Caretaker scoping = two queries (property→lease/invoice) like the manage_tenants
  pattern; fine here.
- Tenant `/me/invoices` = one `Tenant.find({userId})` + one `Invoice.find({tenantId:
  $in})`; indexed on both sides.
- `propertyCount`-style N+1 avoided; list endpoints paginated via
  `parsePagination`/`buildPaginationResult`; no unbounded `lean()` reads of tenant
  lists (field-scoped).
- Derived `overdue` adds an in-memory map per read — negligible; filter path is a
  single indexed query.
- Deliberately not cached: money. No edge caching on invoice endpoints.

## 8. DevOps and observability

- No infra changes; no new env vars (`PAYSTACK_*` deferred).
- New idempotent script `scripts/backfill-rental-invoicing.ts` (`npx tsx`), run
  manually at rollout (not CI).
- Coverage gates (`vitest.config.ts`, per-file): ≥80% lines / ≥75% branches on
  `src/lib/invoicing.ts`, `src/lib/invoice-numbering.ts`,
  `src/lib/invoice-generation.ts`, both schemas, and the seven route modules. No
  global threshold.
- CI gates: `npm run check`, `npm run test` (fully offline — model-mocks),
  `npm run build`. Existing `.github/workflows/ci.yml` unchanged.
- Logging: mark-paid/void/generate record log lines (actorId, action, resourceId,
  timestamp, actor role). No PII, no bodies.

## 9. Implementation tasks (ordered)

Assumes property-management tasks 1–4 & 6 shipped and its infra exists.

1. **Pre-step**: update property-management plan artifacts for the 5th privilege
   (`manage_invoices`) — enum, `privilegeInput`, permission matrix, team-page spec —
   so it lands inside property-management's build.
2. **`developer-prime`** — Models: `Lease`, `Invoice`, `User.invoiceCounters`,
   `Tenant.userId` + all indexes (§4.2–4.5).
3. **`developer-prime`** — lib: `src/lib/invoicing.ts`, `src/lib/invoice-numbering.ts`,
   `src/lib/invoice-generation.ts`, schemas (`lease.ts`, `invoice.ts`) (§4.6–4.9).
4. **`developer-prime`** — Routes, dependency order: `/leases` + `[id]` →
   `/invoices` + `[id]` (+ `mark-paid`, `void`) → `/invoices/generate` →
   `/tenant/me/invoices` + `[id]` (+ `[id]/mark-paid`) (§4.10).
5. **`developer-prime`** — Hooks: `use-leases`, `use-invoices` (with generate sweep),
   `use-my-invoices` (§4.11).
6. **`developer-prime`** — Shared `src/components/invoices/*`; migrate the six pages
   including privilege gating and dropping tenant auto-pay (§4.12); `formatPeriod`
   helper in `src/lib/format.ts`.
7. **`developer-fast`** — Signup-time tenant binding in `/api/auth/route.ts` verify
   flow + `scripts/backfill-rental-invoicing.ts` (§4.13–4.14).
8. **`test-engineer`** — Implement the test plan (§10) in its dependency order,
   extending the shared utils first.
9. **`developer-fast`** — README updates (§4.15); final `npm run check/test/build`.

## 10. Testing strategy

Assumes the property-management test infra exists and is reused: `permission-matrix`
(extended), `api-request`, `model-mocks` (extended with `mockLeaseModel`/
`mockInvoiceModel` + duplicate-seeding `findOne`), `factories` (extended with
`makeLease`/`makeInvoice`/`makeTenantUser`), `render-with-auth`, `/** @vitest-environment
node */` route tests, `connectToDatabase` mocked no-op, `JWT_SECRET=test-secret`,
`MONGODB_URI` unset guard, `vi.setSystemTime`/injected `now` everywhere (no wall-clock).

**Permission matrix extension** — new actions `lease:manage`, `invoice:read`,
`invoice:manage`, `invoice:mark-paid`, `invoice:generate`, `invoice:read-own`; new
actors C6 (`manage_invoices` caretaker) and T (tenant). Locked cells: owner 201/200 in
own scope, cross-owner 404 reads / 403 mutations; system-admin full; C6 scoped
reads+manage+mark-paid+generate (assigned) / still no leases (403); tenant own 200 /
foreign 404, no lease/invoice-manage (403); C0 all 403/404; anomalous 401/403.
Delete on drafted only (409 otherwise); delete lease blocked while invoices reference
it (409); future-period generate → 400; `{leaseId,period}` duplicate → `skipped`.

**Generation tests** (`src/lib/invoice-generation.test.ts`) — idempotency (second run
`toCreate: []`), skip ended/future leases, boundary inclusiveness (startDate = period
start included; endDate = periodEnd included; endDate = periodStart − 1d excluded),
amount = `lease.rentAmount`, non-monthly skipped, month rollovers (Dec→Jan), leap day
(2028-02-29), Gregorian century (2100-02 → 28d), dueDate always 5th of next month
across year/leap borders, emitted doc shape (status pending, amountPaid 0).

**Unit tests** (`src/lib/invoicing.test.ts`) — `nextInvoiceNumber` (sequential,
zero-pad, month reset, >999 growth, malformed period throws), `deriveStatus` (UTC day
boundary 23:59:59 vs 00:00:00, year border, draft/paid/void never flip),
`periodRange`/`lastDayOf`/`computeDueDate`/`isLeaseActiveForPeriod`. Schema tests:
`leaseInput`/`leaseUpdate` (identity fields stripped), `invoiceInput`/`invoiceUpdate`
(status draft|pending only, identity immutable), `invoiceMarkPaidInput` (no amountPaid),
`invoiceGenerateInput`, extended `privilegeInput`. Extend `permissions.test.ts` for the
6 new action columns × C6/tenant/owner/admin.

**Route tests** — leases (`route`, `[id]`): authz matrix, ownerId stripping, missing/
inactive tenant or property → 400/404, delete-with-invoices 409, system-admin any.
Invoices (`route`, `[id]`): manual create scope (lease in-scope required), filters +
derived overdue, PATCH draft-only, delete draft-only 409, mark-paid transitions
(draft/pending → paid; paid/void → 409; stamps paidBy/paidAt/amountPaid), void
(draft/pending → void; paid → 409; already-void idempotent), cross-owner 403/404, C6
in-scope, static-vs-dynamic route check for `generate`. Generate route: default month,
happy path with numbering sequential, re-run `{created:0, skipped:n}` 200, future
period 400, C6 scoped / C0 403 / owner scoped / admin all. `tenant/me/invoices`: 401/403,
tenant own-only, multi-property union (same email two Tenant rows), no Tenant doc →
`200 []`, status filter, derived overdue visible, `[id]` foreign 404, `[id]/mark-paid`
own-only honors audit stamps.

**Component tests** — `InvoicesManager.test.tsx` (tabs+counts, generate button visible
owner/admin but **hidden for C6 only if locked scope denied** — follow §4.10 decision to
show it scoped for C6, mark-paid flow incl. method select + pending-disable, void
confirm, error/empty/loading states, scope rows); `tenant/payments/page.test.tsx`
(own invoices, overdue pills, **mark-paid present for own rows** — per §4.12 requirement
tenant may mark paid own invoice — empty state, no auto-pay anywhere in DOM);
`caretaker/accounting` (C0 denied state; C6 manager rendered); `owner/accounting` smoke
(renders manager + generate). Hooks: `use-leases`, `use-invoices`, `use-my-invoices`
(mocked fetch; optimistic flip + revert on failure; toasts; in-flight disable).

**What NOT to test** — Paystack/gateway, cron infra, `src/proxy.ts`, replaced
localStorage stores, Mongoose internals / mongodb-memory-server, Radix/portal/animation
boilerplate, export/PDF placeholders, unrelated existing smoke tests,
`pagination.test.ts` (already upgraded by previous feature).

**Verify** — `npm run check`, `npm run test`, `npm run build`.

## 11. Migration path

All steps additive, no destructive changes, models deploy before data:
1. Deploy schema/model changes (`Lease`, `Invoice`, `User.invoiceCounters`,
   `Tenant.userId`). Existing docs unaffected (defensive reads: `invoiceCounters ?? {}`,
   `userId ?? ""`).
2. Create indexes (§7 list) — before backfill so writes are covered.
3. Run `scripts/backfill-rental-invoicing.ts` — (a) bind existing tenant Users to
   `Tenant.userId` via email; (b) `--generate` optionally creates invoices for all
   active leases (idempotent).
4. Rollback: revert code; additive fields/collections left behind are harmless
   (empty counters, unbound userId).
5. Defer Paystack: `amountPaid` already split-ready; `method` enum includes the
   gateway channels today.

## 12. Rollout plan

1. Land pre-step (privilege enum extension) with property-management first.
2. Ship models + lib + routes + hooks + UI on `dev`, verified per grouping.
3. Manual QA on `dev`: create lease → generate month → invoice appears owner +
   tenant side; mark-paid by owner and by tenant (audit fields set); void/delete
   transitions; caretaker with/without `manage_invoices`; admin full control;
   idempotency (re-generate same month → created 0).
4. Run backfill script; re-verify tenant own-invoice visibility.
5. Merge to `main` per repo workflow; monitor auth 401/403, generate failures,
   rate-limit hits, mark-paid log lines.
6. Rollback triggers: elevated 4xx/5xx after deploy or any invoice-number /
   generation anomaly → revert code (data additive-safe).

## 13. Open questions — adjudicated & locked

Deltas between the consultant blueprints were resolved here (no Tier-2 escalation
needed; none are security-critical beyond what property-management already locked):

1. **Tenant self mark-paid: ALLOWED.** The user requirement explicitly says
   "owner or tenant marks paid offline"; audit fields make it safe. The stricter
   "tenant read-only" option was rejected as contradicting the requirement.
2. **`dueDate` = 5th of next month** (grace period; e.g. period "2026-01" → due
   2026-02-05), UTC — not last-day-of-period. Chosen for realism + strong date-test
   coverage.
3. **Invoice numbering = per-owner atomic counter** on `User.invoiceCounters`
   (`INV-YYYYMM-NNNN`), not a per-month count (race + delete-reuse risks in the
   count approach). Unique index backstop.
4. **Caretaker `manage_invoices` generation: allowed, scoped to assigned
   properties** (mirrors `manage_tenants` scope), not a flat 403 — so the privilege
   is meaningfully usable on the caretaker accounting page.
5. **Tenant endpoint = `/api/v1/tenant/me/invoices`** (mirrors `/api/auth/me`
   naming), not `/me/invoices`.
6. **Lease status = `["active","ended"]`**; future-start leases are derived from
   `startDate` (no separate "future" status cell).
7. **Method enum extended** to `["M-Pesa","Card","Bank","Cash","Other"]` for
   offline recording; Paystack channels map in later.
8. **Privilege enum extended pre-implementation** to include `manage_invoices` —
   the property-management plan must be updated atomically before it ships.
9. **Monetary/phone formatting**: KES whole units, `formatKES`; periods as ISO
   strings compare correctly with the existing `localeCompare` grouping.
10. **Timezone**: periods + dueDates are UTC calendar months; documented in README.