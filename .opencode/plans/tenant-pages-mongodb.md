# Keja Yangu — Tenant Pages → Mongo

## 1. Summary

Replace the localStorage-backed data of five tenant dashboard pages (complaints, chat, announcements, documents, and the reports page's complaint slice) with MongoDB collections behind new `/api/v1/*` routes. Auth stays JWT-cookie + `requirePermission`; tenant scoping follows the `tenant/me/invoices` precedent (`resolveTenantIds`). Five new Mongoose models, unified actor/filter helpers, new permission actions/privileges, and five client hooks (chat polls every 10s) migrate the pages with **byte-identical UI** — only the data source changes. Staff-side mutation capacity (complaint status PATCH, chat thread/message + read, announcement POST) is built now so the later owner/caretaker conversions are UI-only, but **no owner/caretaker UI is touched this round**. No file storage, no websockets, no notifications.

## 2. Scope

### In
- Models: `Complaint`, `ChatThread`, `ChatMessage`, `Announcement`, `PropertyDocument`.
- Permission actions + caretaker privileges for complaints/chat/announcements/documents.
- `resolveDashboardActor`/`requireDashboardPermission`/`propertyTitleMap` scope helpers.
- Routes: `GET/POST /api/v1/complaints`, `PATCH /api/v1/complaints/[id]`, `GET/POST /api/v1/chat/threads`, `GET /api/v1/chat/threads/[id]/messages`, `POST /api/v1/chat/threads/[id]/messages`, `POST /api/v1/chat/threads/[id]/read`, `GET/POST /api/v1/announcements`, `GET /api/v1/documents`.
- Hooks `useComplaints`/`useComplaintMutations`, `useChatThreads` (10s poll) / `useThreadMessages` / `useChatMutations`, `useAnnouncements`, `useDocuments`.
- Page swaps for the five tenant pages, preserving exact UI.
- Reports page reads complaints from the API; invoices/applications stay as-is.

### Out
- Owner/caretaker UI for these pages (theirs remains localStorage this round; API capacity is ready).
- Real file storage/upload pipeline (`contentUrl`) — documents are metadata rows; the tenant download stays a client text blob.
- `POST /api/v1/documents` (deferred to the owner-documents conversion).
- Complaint `DELETE`; announcement `DELETE`.
- Websockets/SSE; notifications feature (separate plan reads these tables).
- Migrating payments, applications, tasks, settings, owner/caretaker stores.
- Deleting `src/data/dashboard.ts` (owner pages still consume its shared stores).
- Message embedding / 50-message cap.
- `getTenantScope` reuse (it 403s tenants).

## 3. Architecture

```
Tenant pages (5)                     API layer                        Mongo
  useComplaints ──────────────► GET/POST /api/v1/complaints     ──► complaints
  useChatThreads (10s poll) ───► GET/POST /api/v1/chat/threads   ──► chatthreads
  useThreadMessages ───────────► /threads/[id]/messages[/read]   ──► chatmessages
  useAnnouncements ────────────► GET/POST /api/v1/announcements  ──► announcements
  useDocuments ────────────────► GET /api/v1/documents           ──► propertydocuments

All routes: requirePermission → resolveDashboardActor → filter/scoping → Mongo.
Tenant identity: resolveTenantIds(userId) → Tenant._ids (parity with tenant/me/invoices).
Staff mutations (PATCH complaint, chat reply, announcement POST) built now, UI later;
touched only by caretaker/owner later — this round only tenant UIs change.
```

## 4. What to do

- **`src/lib/domain-enums.ts`** (mirrors `lib/invoicing.ts` style): `COMPLAINT_CATEGORIES/STATUSES/PRIORITIES`, `MESSAGE_SENDER_ROLES=["tenant","owner","caretaker"]`, `ANNOUNCEMENT_AUDIENCES=["all","tenants","staff"]`, `DOCUMENT_CATEGORIES`, `DOCUMENT_SCOPES`.
- **Models** (Lease/Invoice style — `I<Name>` → Schema → indexes → `models.X || model`, String ids, no refs/populate):
  - `Complaint`: tenantId, propertyId, ownerId, subject (maxlen 200), category, message, status (default "open"), priority (default "medium"), resolution?, updatedById?, updatedByRole?. Indexes {tenantId,createdAt:-1}, {propertyId,status}, {ownerId,createdAt:-1}.
  - `ChatThread`: tenantId, propertyId, ownerId, agentUserId, agentRole (enum owner/caretaker snapshot), lastMessageAt, lastMessageText, tenantLastReadAt?, agentLastReadAt?. Unique `{tenantId, propertyId, agentUserId}`; {ownerId,lastMessageAt:-1}; {agentUserId,lastMessageAt:-1}.
  - `ChatMessage`: threadId (index), senderUserId, senderRole, text (maxlen 2000). Index {threadId, createdAt:1}.
  - `Announcement`: title (200), body (5000), authorId, authorName (denormalized), ownerId, propertyId ("" = portfolio-wide), pinned (default false), audience (default "tenants"). Indexes {ownerId,pinned:-1,createdAt:-1}, {propertyId,pinned:-1,createdAt:-1}.
  - `PropertyDocument`: name, category, scope, propertyId, tenantId ("" unless scope tenant), ownerId, uploadedById, uploadedByName, sizeLabel (default "—"). Indexes {tenantId,createdAt:-1}, {propertyId,createdAt:-1}, {ownerId,createdAt:-1}. **No contentUrl.**
- **Permissions**: append to `Action`: `complaint:read-own`, `complaint:create`, `complaint:manage`, `chat:read-own`, `chat:send`, `chat:manage`, `announcement:read`, `announcement:manage`, `document:read-own`, `document:manage`. Tenant branch → allow-list `TENANT_OWN_ACTIONS`; full-control `ownsResource` gains the 4 manage actions; caretaker switch adds `return null` for the "-own/read/send/create" actions and `privilege + resource.ownerId===managedByOwnerId` for the 4 manage cases. `CARETAKER_PRIVILEGES` gains `manage_complaints`, `manage_announcements`, `send_messages`, `manage_documents`. **`src/models/User.ts` privileges enum array must mirror.**
- **`src/app/api/v1/_helpers.ts`**: `resolveDashboardActor(request)` → `{role, userId, managedByOwnerId, assignedPropertyIds (caretaker), tenantIds, tenantPropertyIds (tenant)}`; `requireDashboardPermission(request, actor, tenantAction, staffAction)`; `propertyTitleMap(propertyIds)` → Map id→title. **Do not refactor `resolveInvoiceActor`** (public + tested); duplicate the ~90% identical body.
- **Routes** (envelope: lists `buildPaginationResult`, singles `{data}`, creates 201; mutations: `rateLimit` + `checkSameOrigin` first; `isValidObjectId` on all `[id]`):
  - `GET /api/v1/complaints` — filter per actor: tenant `{tenantId:{$in:tenantIds}}` (empty → empty page), owner `{ownerId:userId}`, caretaker `{ownerId:managedByOwnerId, propertyId:{$in:assignedPropertyIds}}`, admin `{}`; optional `status` filter; sort createdAt:-1. `POST` — tenant only (`complaint:create`); derive tenantId/propertyId/ownerId from the Tenant row(s); single-row tenant auto-pins, multi-row requires `propertyId` (400 if ambiguous, 403 if not theirs); auto title via `propertyTitleMap`.
  - `PATCH /api/v1/complaints/[id]` — `complaint:manage` with `{resource: complaint}`; caretaker extra route-level `assignedPropertyIds` check (invoices precedent); zod `complaintUpdate {status?, resolution?}`; set `updatedById/updatedByRole`.
  - `GET /api/v1/chat/threads` — actor filter (tenant own / owner by ownerId / caretaker `agentUserId: userId` / admin all), sort lastMessageAt:-1, participant names (`User.find` for agent names, `Tenant.find` for tenant names), title map, unread per thread = `countDocuments({threadId, senderUserId:{$ne:actor.userId}, createdAt:{$gt:lastReadAt}})`.
  - `POST /api/v1/chat/threads` — tenant only (`chat:send`); validate agent is property owner or an assigned caretaker (403 otherwise); create thread; E11000 → return existing with 200 (create-or-get).
  - `POST /api/v1/chat/threads/[id]/messages` — both sides: participant gate (tenant own thread / owner own property / caretaker `agentUserId===me` + `send_messages`); `senderRole = actor.role`; `serializeMessage` maps `sender: senderUserId===actor.userId ? "me" : "them"`, `at: createdAt`; updates thread `lastMessage*`.
  - `POST /api/v1/chat/threads/[id]/read` — participant gate; tenant sets `tenantLastReadAt=now`, agent sets `agentLastReadAt=now`; idempotent.
  - `GET /api/v1/announcements` — tenant: `{propertyId:{$in:[...tenantPropertyIds, ""]}, audience:{$in:["all","tenants"]}}` (audience leak guard); staff own records; sort pinned:-1, createdAt:-1; serialize `property = title ?? "All properties"`. `POST` — staff (`announcement:manage`); ownerId = caretaker ? managedByOwnerId : userId; authorName from user doc.
  - `GET /api/v1/documents` — tenant: `$or [{scope:"tenant", tenantId:{$in}}, {scope:"property", propertyId:{$in}}]`; staff records; sort createdAt:-1; `size: sizeLabel`, `uploadedBy: uploadedByName`.
- **Serializers**: `src/lib/{complaints,chat,announcements,documents}.ts` (invoicing precedent — `serializeInvoice` lives in a lib). Client shapes in `src/types/communications.ts` mirror the UI field names (`_id`, `property` as title string, `sender:"me"|"them"`, `size`, `uploadedBy`).
- **Hooks** (mirror `use-my-invoices.tsx`: SWR-less, cancelled flag, `reload` counter, `limit=100`): `useComplaints({status?})` + `useComplaintMutations`; `useChatThreads(pollMs=10000)` + `useThreadMessages(threadId|null)` + `useChatMutations` (send + openThread = optimistic unread 0 + POST /read + startThread); `useAnnouncements`; `useDocuments`. Chat poll: `setInterval`, `inFlight` guard, clear on unmount, optional `document.hidden` pause.
- **Pages** (swap data source only — exact UI): complaints (keep dialog; submit → `createComplaint` then refetch; no property field unless multi-property), chat (thread select by `_id`, send appends locally, `unreadTotal` sum, openThread marks read), announcements (client sort stays for determinism; stat cards identical), documents (table + client blob download unchanged), reports (complaints from `useComplaints`; invoices/applications unchanged).
- **`src/test/utils/model-mocks.ts`** add stubs for the 5 models; factories `makeComplaint/makeChatThread/makeChatMessage/makeAnnouncement/makeDocument`; permissions tests for new actions/privileges.

## 5. What NOT to do

- **No file storage / contentUrl / upload pipeline.** Documents are metadata rows.
- **Do not embed messages** — separate `ChatMessage` collection (the 50-message cap is the rejected fallback).
- No websockets/SSE — 10s polling only, and only the chat hook polls.
- No notifications feature — no event pipe, no schema stubs (later feature reads these tables).
- No `middleware.ts` — continue on `src/proxy.ts` (its `/api/:path*` matcher already covers new routes).
- Don't delete `src/data/dashboard.ts` — owner pages still consume shared stores.
- Don't migrate payments, applications, tasks, settings.
- No complaint DELETE; no announcement DELETE; no tenant-side edit/delete.
- Don't reuse `getTenantScope` (403s tenants) — use `resolveDashboardActor`.
- No `ref`/`populate` — keep string ids + two-step lookups (keeps model-mocks simple).
- Don't switch scoping to `userId` — complaints/chat/documents scope by `Tenant._ids` via `resolveTenantIds`, matching `invoice:read-own`.

## 6. Security considerations

- Every route: `requirePermission` before any read/write; tenant scoping `$in tenantIds`; foreign `[id]` → 404 (no existence oracle — consistent with invoice routes).
- Caretaker mutations: privilege + `resource.ownerId === managedByOwnerId` + route-level `assignedPropertyIds` check.
- Chat agent validation: only the property owner or an assigned caretaker can be a thread agent (403 otherwise).
- Announcement audience leak guard: tenant reads exclude `audience:"staff"`.
- Invalid agent / cross-property thread attempts rejected server-side.
- `isValidObjectId` on all `[id]` params (convention); zod input validation with `parsed.error.flatten()` 400s.
- Tenant with no bound rows: GETs → empty page; POSTs → 403 with clear message.

## 7. Performance considerations

- All lists paginated; indexes match the hottest filters (tenant page, caretaker board).
- Chat thread list ships only summary (lastMessage fields), not full histories; message GET caps at last 100 (cursor later).
- Unread derived from per-participant `lastReadAt` — one indexed count per thread, not per-message flags.
- Title lookups batched via a single `$in` (propertyTitleMap).
- 10s chat poll with `inFlight` guard and hidden-tab pause; no duplicate writes on polls (polling only reads).

## 8. DevOps and observability

- No new env vars, no infra changes.
- Log structured `[complaints|chat|announcements|documents] actor role action` lines on mutations (invoice precedent).
- No CI/CD changes.

## 9. Implementation tasks

1. `src/lib/domain-enums.ts` + 5 models + model-mocks/factories.
2. `src/lib/schemas/{complaint,chat,announcement,document}.ts` + exports.
3. Permissions (Action union, allow-list, `ownsResource`, caretaker cases, `CARETAKER_PRIVILEGES`, User enum) + permissions tests.
4. `_helpers.ts` (`resolveDashboardActor`, `requireDashboardPermission`, `propertyTitleMap`).
5. Complaint routes + tests.
6. Chat routes (threads, messages, read) + tests.
7. Announcement + document routes + tests.
8. Serializers + `src/types/communications.ts`.
9. Hooks (+ `use-chat` poll test).
10. Five tenant page swaps + reports page.
11. README API table.

Each step gated by `npx tsc --noEmit`, `npx biome check`, `npm test` (repo per-step convention).

## 10. Testing strategy

- Route tests (`buildRequest` + model stubs convention): per-route matrix — tenant own-only reads, tenant create with property derivation (single/multi/ambiguity), staff PATCH with privilege + assignment checks (403 without), chat participant gates (tenant/owner/caretaker/admin), agent validation, announcement audience filter, document scope filter. Edge cases: no bound Tenant (empty/403), duplicate thread (E11000 → 200 existing), invalid ObjectId → 400, `status`/`propertyId` filters, foreign `[id]` → 404.
- Permissions tests: new actions allowed/denied per role and privilege.
- Hook tests (jsdom): poll interval + inFlight, optimistic unread, mutations call correct endpoints.
- Page smoke tests where they add value (swapped pages still render).

## 11. Migration path

- Additive only — new collections/routes. Page swaps change the client data source; identical shapes mean no persisted placeholder.
- Existing localStorage rows are simply ignored (no seeding; collections start empty in dev).
- Rollback: revert page swaps to `useLocalStore`; routes/models removed harmlessly.

## 12. Rollout plan

- Ship in the task order above (models → permissions → routes → hooks → pages) on `dev`, verify per step, then merge to `main` and push both branches (repo convention).
- Seed script for dev parity is optional/skipped — collections empty until real data exists.

## 13. Open questions

1. Multi-property tenants: "require `propertyId` when ambiguous" (chosen); complaints dialog gains a property selector only for multi-property users.
2. `POST /chat/threads/[id]/read` and `GET /chat/threads/[id]/messages` are additions beyond a minimal list but required for unread/history parity (confirmed in scope).
3. `POST /api/v1/documents` deferred to the owner-documents conversion (confirmed).
4. Property-scope documents visible to all tenants of the property (chosen — matches seed intent).
5. system-admin sees all rows on the new GETs (consistent with existing admin pattern).
6. Tightened rate limits on the new mutations: complaint POST 10/min, thread POST 10/min, message POST 30/min (confirmed vs the repo's usual 20/min).
7. `updatedById/updatedByRole` on Complaint added now (chosen).