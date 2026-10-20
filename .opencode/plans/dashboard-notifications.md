# Keja Yangu — Dashboard Notifications (wiring pending items into the bell)

## 1. Summary

Role dashboards already ship a notifications system — a persisted `Notification` collection, a 4-inbox REST API, a 30s-polling unread-count hook, and a header bell + dropdown mounted in `DashboardShell` for every role. However, **only invoice/lease events ever create notifications**. Announcements, chat messages, complaints (create + status change), and move requests have zero call sites, so every dashboard bell looks empty regardless of pending work. This feature wires those four sources into the existing system (adding two new notification types for move requests and closing recipient gaps for custodians), so tenants, caretakers, custodians, and owners see unread items in their bell the moment they matter. This plan extends `.opencode/plans/notifications.md`, whose "defined seams that fire when those features ship" are now fired.

## 2. Scope

### In
- Call-site wiring (awaited, in-request, established pattern):
  - Announcements POST → `notifyAnnouncement` + new `resolveAnnouncementRecipients`.
  - Chat message POST → `notifyMessageReply` with a role-aware link.
  - Complaint POST → `notifyComplaintCreated` (now incl. custodians).
  - Complaint PATCH → `notifyComplaintStatusChange`, only on a real status transition (now deduped per status).
  - Move request POST → new `notifyMoveRequestCreated` (owner + caretakers + custodians).
  - Move request PATCH → new `notifyMoveRequestDecided` (the requester), on any status transition.
- New notification types `move-request:created`, `move-request:decided` (model enum + client union).
- Dedupe-key upgrade: `eventId` override + `moveRequestId` in the resolution chain.
- New recipient helpers in `src/lib/notifications.ts`: `resolveStaffRecipients`, `resolveAnnouncementRecipients`.
- Role-aware deep links for announcement, chat, and complaint notifications (today several hardcode tenant links).
- Tests: extend `src/lib/notifications.test.ts`; add `vi.mock("@/lib/notifications")` assertions to the 6 affected route test files.

### Out (explicit)
- **No new UI.** The bell, dropdown, badge, polling hook already exist and are mounted on every dashboard (`src/components/DashboardShell.tsx:140`). No bell redesign, no type icons, no "View all" page, no filters/unread toggle (all deferred in `.opencode/plans/notifications.md`).
- No dashboard home "pending items" cards/widgets (user chose bell + dropdown only).
- No websockets/SSE — 30s polling stays.
- No new email senders: new types are in-app only; only the pre-existing complaint-status email remains.
- No per-announcement read state (`readBy`/`lastSeenAt` on `Announcement`) — unread announcements are derived purely from `Notification.readAt`.
- No retrofit of invoice/lease orchestrators to include custodians (see Open Questions #1).
- No cron/sweeps/queues; no new dependencies; no README API-table changes (no new endpoints).
- Fixing the pre-existing custodian complaint-list scoping quirk (see Open Questions #2).

## 3. Architecture

No new components. The existing data flow gains write-side producers:

```
Write routes (producers)                                Existing consumer side
─────────────────────────                               ──────────────────────
POST /announcements ──┐
POST /chat/…/messages ┤                                GET /notifications/unread-count ── useUnreadCount (30s poll)
POST /complaints ─────┤  await notifyX(doc)            GET /notifications?unread=true ──── NotificationsBell panel
PATCH /complaints/[id]┤  (never throws;                PATCH /notifications/[id] ──────── mark read
POST /move-requests ──┤   dedupe via unique            POST /notifications/mark-all-read
PATCH /move-requests  ┘   recipient+dedupeKey index)            ▲
                                                                    │ badge + dropdown in DashboardShell
src/lib/notifications.ts                                          │ (all 5 role dashboards)
  ├─ resolveStaffRecipients(ownerId, propertyId?) → owner + custodians + caretakers [{userId, role}]
  ├─ resolveAnnouncementRecipients(announcement) → audience-scoped tenants + staff (excludes author)
  ├─ notifyAnnouncement / notifyMessageReply / notifyComplaintCreated / notifyComplaintStatusChange
  ├─ notifyMoveRequestCreated / notifyMoveRequestDecided        (NEW)
  └─ notifyUser(userId, {type,title,body,data,link})            (existing; dedupe + optional email)
```

Event → row: one orchestrator call fans out N `notifyUser` rows (one per recipient), each deduped by `{recipientUserId, dedupeKey}`. Recipient roles are resolved server-side; links are server-composed role-aware deep links.

## 4. What to do

### 4.1 Types and model (additive)
- `src/models/Notification.ts` — extend `NOTIFICATION_TYPES` with `"move-request:created"`, `"move-request:decided"`.
- `src/types/notifications.ts` — mirror the two values in the client `NotificationType` union.
- No schema/index changes. Mongoose enum validation applies to new writes only; existing rows unaffected.

### 4.2 Dedupe (`src/lib/notifications.ts:41-51`, `resolveDedupeKey`)
- Precedence chain becomes: `data.eventId ?? data.invoiceId ?? data.leaseId ?? data.complaintId ?? data.moveRequestId ?? data.announcementId ?? data.messageId ?? data.threadId ?? ""`.
- Result stays `${type}:${eventId}`.
- Rationale: a complaint can change status multiple times and a move request can be re-decided; today's key (`complaint:status-changed:<id>`) would notify only the *first* transition for 90 days. Orchestrators that need per-transition notification pass an explicit `eventId` (e.g. `` `${complaintId}:${status}` ``).

### 4.3 New recipient helpers (`src/lib/notifications.ts`)
- `resolveStaffRecipients({ ownerId, propertyId? }): Promise<{ userId: string; role: "owner" | "caretaker" | "custodian" }[]>`
  - owner → `{ ownerId, role: "owner" }`.
  - custodians → `User.find({ role: "custodian", managedByOwnerId: ownerId })` (ids + role known from query).
  - caretakers → if `propertyId`: `Property.findById(propertyId).select("caretakerIds")`; else `Property.find({ ownerId }).select("caretakerIds")` (portfolio-wide). Role is known (`caretakerIds` only contains caretakers).
  - De-duplicate by `userId`, drop empty ids. Never throws (returns `[]` on lookup failure) — mirrors `resolveCaretakerIds` style.
- `resolveAnnouncementRecipients(announcement): Promise<string[]>`
  - Staff part (audience `"all"`/`"staff"`): ids from `resolveStaffRecipients({ ownerId: announcement.ownerId, propertyId: announcement.propertyId || undefined })`.
  - Tenant part (audience `"all"`/`"tenants"`): `Tenant.find({ ownerId, deletedAt: null, userId: { $ne: "" }, ...(announcement.propertyId && { propertyId: announcement.propertyId }) }).select("userId")` → non-empty userIds. (`deletedAt: null` excludes removed tenancies; no `status` filter, matching what the tenant announcements GET scopes; `userId !== ""` skips unclaimed tenants, per the original plan's ruling.)
  - Union, unique, **exclude `announcement.authorId`** (never notify the author of their own post). Returns `[]` on failure.
  - Scoping rationale: mirrors the GET filter semantics in `src/app/api/v1/announcements/route.ts:39-58` (property-scoped or owner-portfolio-wide), so no tenant ever learns about announcements they cannot list.

### 4.4 Orchestrator changes (all in `src/lib/notifications.ts`; all never throw)
- **`notifyAnnouncement(announcement, recipientUserIds)`** — keep signature, fix links: batch-load `User.find({ _id: { $in: recipientUserIds } }).select("role")` in ONE query, then link per role: `tenant → /dashboard/tenant/messages` (announcements tab in Messages), `owner|caretaker|custodian → /dashboard/<role>/communications`, `system-admin → /dashboard/system-admin`. Unknown/missing role → tenant link fallback (existing behavior). In-app only (unchanged).
- **`notifyMessageReply(message, recipientUserId, link?)`** — add optional third param `link` defaulting to `"/dashboard/tenant/messages"` (keeps existing behavior/tests valid). The chat call site passes the role-correct link. Self-skip and empty-recipient guard unchanged.
- **`notifyComplaintCreated(complaint)`** — replace the hand-rolled owner+caretaker loop with `resolveStaffRecipients({ ownerId: property.ownerId, propertyId: complaint.propertyId })` so custodians are included; per-role links: `owner → /dashboard/owner/communications`, `caretaker → /dashboard/caretaker/communications`, `custodian → /dashboard/custodian/communications`. Keep the single `Property.findById` (it still supplies `ownerId`; `caretakerIds` come from the helper — avoid double property reads by passing the loaded doc's ids into the helper's propertyId path). In-app only.
- **`notifyComplaintStatusChange(complaint)`** — unchanged except `data = { complaintId, status, eventId: `${complaintId}:${status}` }` so each distinct status notifies once. Tenant in-app+email kept as-is.
- **`notifyMoveRequestCreated(request)` (NEW)** — `MoveRequestLike { _id, type, ownerId, propertyId, requestedById, requestedByRole, requestedFor?, status }`.
  - Recipients: `resolveStaffRecipients({ ownerId, propertyId })`, skipping any `userId === String(requestedById)` (a staff member who created it doesn't get their own "new request").
  - `type: "move-request:created"`, title `` `New ${request.type === "move-in" ? "move-in" : "move-out"} request` ``; body includes `requestedFor` when non-empty (it is a display string per `src/models/MoveRequest.ts:17`) — e.g. `` `A ${type} request is awaiting review (requested for ${requestedFor}).` ``; `data: { moveRequestId, propertyId }` (dedupe key `move-request:created:<id>` per recipient); link per role `/dashboard/<role>/move-requests`; in-app only.
- **`notifyMoveRequestDecided(request)` (NEW)**
  - Recipient: `request.requestedById`; skip if empty or `=== request.decidedById` (never notify the decider of their own decision).
  - `type: "move-request:decided"`, `data: { moveRequestId, status, eventId: `${moveRequestId}:${status}` }` (re-decisions to a different status notify again).
  - Title `` `Move request ${status}` ``; body: `` `Your ${type} request was ${status}.` `` plus `decisionNote` when non-empty.
  - Link by `requestedByRole`: `tenant → /dashboard/tenant/requests`, `owner|caretaker|custodian → /dashboard/<role>/move-requests`, `system-admin (or unknown) → /dashboard/system-admin` (system-admin has no move-requests page — `src/config/dashboardNav.ts:67-69`).
  - In-app only.

### 4.5 Call sites (exactly where; follow the established `await notifyX(...)` pattern from `mark-paid/route.ts:115`)
1. **`src/app/api/v1/announcements/route.ts` POST** — after `created` is fetched (after line 148, before the `console.info`):
   ```ts
   const recipients = await resolveAnnouncementRecipients(created);
   await notifyAnnouncement(created, recipients);
   ```
   (Zero recipients → loop no-ops; still awaited for deterministic tests.)
2. **`src/app/api/v1/chat/threads/[id]/messages/route.ts` POST** — after the thread update (line 111), before the response. Resolve the other side of the two-sided thread model:
   - `actor.role === "tenant"` → recipient `thread.agentUserId`; link = `thread.agentRole === "owner" ? "/dashboard/owner/communications" : "/dashboard/caretaker/communications"` (thread creation only ever sets agentRole owner|caretaker — `chat/threads/route.ts:154-163`).
   - else (owner/custodian/caretaker/system-admin sending) → `Tenant.findById(thread.tenantId).select("userId")`; recipient = that `userId`; link `"/dashboard/tenant/messages"`.
   - `await notifyMessageReply(message, recipient, link)` — orchestrator's own guards cover empty/self.
3. **`src/app/api/v1/complaints/route.ts` POST** — after `created` (line 148): `await notifyComplaintCreated(created);`
4. **`src/app/api/v1/complaints/[id]/route.ts` POST/PATCH** — after the successful update (line 79), only when the status actually changed:
   ```ts
   if (parsed.data.status !== undefined && parsed.data.status !== complaint.status) {
     await notifyComplaintStatusChange(updated);
   }
   ```
   Resolution-only or no-op updates must NOT notify.
5. **`src/app/api/v1/move-requests/route.ts` POST** — both create branches (tenant branch line 148-156 and staff branch line 165-172): `await notifyMoveRequestCreated(created);` before returning 201.
6. **`src/app/api/v1/move-requests/[id]/route.ts` PATCH** — after `moveRequest.save()` (line 72):
   ```ts
   if (previousStatus !== moveRequest.status) {
     await notifyMoveRequestDecided(moveRequest);
   }
   ```

### 4.6 Tests (see §10)
Extend/patch the files listed in §10 using the existing `vi.mock("@/lib/notifications")` pattern proven in `invoices/[id]/mark-paid/route.test.ts:11-21`.

## 5. What NOT to do (rejected approaches)

- **Do not build a new Notification model, API, bell, hook, or widget** — all exist; re-building = duplicate systems. (Rejected because the gap is producers, not consumers.)
- **Do not derive unread state on the fly from source collections** (e.g. `lastSeenAt` on Announcement) — read state must be persisted per user; `Notification.readAt` already provides it; a parallel mechanism would fork the badge logic. (Rejected per user decision + existing architecture.)
- **Do not add websockets/SSE or client refetch storms** — 30s visibility-aware polling is the settled delivery channel.
- **Do not fire-and-forget (`void notifyX`) the new call sites** — every existing call site awaits (8/8); awaiting keeps tests deterministic and the request path honest, and `notifyX` never throws so it cannot fail the request.
- **Do not send emails for chat/announcement/move-request notifications** — original plan ruled in-app only; per-message chat email was explicitly excluded.
- **Do not notify the actor of their own action** (announcement author, complaint creator on create, move-request creator on creation, decider on decision, message sender) — self-noise destroys trust in the badge.
- **Do not notify system-admins on move requests** — they have no `/dashboard/system-admin/move-requests` page; a dead link is worse than no notification.
- **Do not put the recipient-resolution queries in route handlers** — recipient logic lives in `src/lib/notifications.ts` next to every other orchestrator's resolution, keeping routes thin and the logic unit-testable.
- **Do not batch with `insertMany`/raw bulk writes or introduce queues/crons** — volume is small-medium; `notifyUser` must keep its per-row dedupe + email semantics (§7).
- **Do not change existing invoice/lease orchestrator recipient matrices** in this feature — separate, independently shippable decision (Open Questions #1).
- **Do not add `readBy` arrays to `Announcement`** — would require write-on-read endpoints, fan-out on read, and a second unread source; the Notification row is the single source of unread truth.
- **Do not widen `complaint:status-changed` email** or add new email content builders — untouched.

## 6. Security considerations

- **Controls that must hold:**
  - Announcement fan-out must reproduce the GET scoping (`announcements/route.ts:39-58`): property-scoped or ownerId-portfolio-scoped tenants, audience-filtered (`all|tenants` for tenants; `all|staff` for staff), author excluded. A tenant must never receive a notification linking to an announcement they cannot list (link is `/dashboard/tenant/messages`, whose GET re-scopes anyway — the notification itself must not leak title/body of out-of-scope posts).
  - Custodian recipients come only from `User.find({ role: "custodian", managedByOwnerId: ownerId })` — never across owners.
  - Chat: recipient resolution is restricted to the two sides of the already-participant-checked thread; no new authorization surface (the route verifies `isParticipant` before create).
  - Move requests: creation fires only after the route's existing ownership/scope checks; decision fires only behind `requirePermission("move-request:manage", { resource: { ownerId } })`.
  - All new `data` payloads carry only ids/status already known to the recipient; titles/bodies are built server-side from DB fields (React escapes on render).
- **Must not:**
  - Never log notification bodies, announcement bodies, or message text — keep the existing `console.info` shape (`[notifications] … type dedupeKey emailSent:<bool>`, `[source] create actor=… id=…`).
  - Never trust client-supplied recipients/links; server composes everything (per original plan).
  - Never bypass `wantsEmailNotifications`/`isEmailConfigured` for the retained complaint-status email.
- Adjacent finding (out of scope, logged as Open Question #2): `GET /api/v1/complaints` has no `custodian` filter branch, so a custodian currently gets an unscoped list. Do not compound it here; do not copy that pattern.

## 7. Performance considerations

- **Load model:** one notification write-path per user action (rate-limited routes: announcements 10/min, chat 30/min, complaints 10/min, move-requests POST unthrottled but form-driven). Fan-out sizes: chat/complaint/move-request = 1–4 rows; announcement = tenants of one property or of an owner's portfolio (expected tens, not thousands, at this deployment's scale).
- **Accepted trade-off:** sequential `await notifyUser` per recipient = ~2 queries each (`User.findById` + `Notification.create`, +1 role batch query per orchestrator). A 50-tenant portfolio announcement ≈ 100 indexed single-doc operations inside the POST — acceptable for small-medium volume and consistent with `notifyOverdueInvoices` (up to 200 invoices × 3 recipients today). Escape hatch if it ever hurts: `void notifyAnnouncement(...)` in the announcements route only.
- **Polling:** `GET /notifications/unread-count` is a single `countDocuments({recipientUserId, readAt:null})` covered by the `{recipientUserId, readAt}` index, every 30s per open tab, paused when hidden (`use-unread-count.tsx:31-46`). New types need no new index — the count never filters on `type`.
- **List:** `{recipientUserId, createdAt:-1}` covers the dropdown's `readAt: null` + sort query.
- **Ruled out:** insertMany batching, background jobs, message queues, cache layers, debounce/trailing-edge coalescing of the poll — unjustified at this scale and would break per-row dedupe/email semantics.
- Move-request POST has no rate limit today (pre-existing); adding notifications does not materially change its cost profile — do not silently add rate limiting in this feature (scope).

## 8. DevOps and observability

- No env, CI, deployment, or infra changes. `NOTIFICATION_RETENTION_DAYS` (default 90) TTL already covers the new rows.
- Logging: one existing-shape `console.info` per producing route (already present) — do not add per-recipient logs; `notifyUser`'s warn-on-dedupe/failure lines already exist.
- Verification signal post-deploy: create one event per source per role and confirm the badge count increments within 30s and the dropdown row deep-links correctly.
- CI: `biome check .`, `typecheck`, `build`, `test:coverage` must stay green (see Definition of Done).

## 9. Implementation tasks (ordered)

| # | Task | Agent |
|---|---|---|
| 1 | Add the 2 types to `src/models/Notification.ts` + `src/types/notifications.ts`; extend `resolveDedupeKey` (`eventId` precedence + `moveRequestId`) in `src/lib/notifications.ts` | developer-fast |
| 2 | Add `resolveStaffRecipients` + `resolveAnnouncementRecipients` to `src/lib/notifications.ts` | developer-fast |
| 3 | Update `notifyAnnouncement` (role-aware links via one batch User query), `notifyMessageReply` (link param), `notifyComplaintCreated` (staff helper incl. custodian + role links), `notifyComplaintStatusChange` (status-suffixed `eventId`) | developer-fast |
| 4 | Add `notifyMoveRequestCreated` + `notifyMoveRequestDecided` to `src/lib/notifications.ts` | developer-fast |
| 5 | Wire the 6 call sites (§4.5) across the 5 route files | developer-fast |
| 6 | Extend `src/lib/notifications.test.ts`: dedupe eventId/moveRequestId precedence, both new orchestrators (recipients, self-skips, links, re-decision), staff/announcement recipient matrices (audiences × propertyId/portfolio × author exclusion × empty userId), updated orchestrator assertions | test-engineer |
| 7 | Patch the 6 route test files with `vi.mock("@/lib/notifications")` + call assertions (incl. negative cases: unchanged status, resolution-only update, self-decision) | test-engineer |
| 8 | Run Definition of Done (`npm run check && npm run typecheck && npm run test`), fix fallout | developer-fast |

## 10. Testing strategy

Repo rules: colocated `*.test.ts(x)`, Vitest + globals, model stubs from `src/test/utils/model-mocks.ts` (already includes a `notification` stub), route tests mock auth/DB as existing files do.

- **`src/lib/notifications.test.ts` (extend):**
  - `resolveDedupeKey`: `eventId` wins over `invoiceId`; `moveRequestId` resolves; empty data → `""`.
  - `resolveAnnouncementRecipients`: audience `tenants` → tenants only; `staff` → staff only; `all` → both; `propertyId` set vs `""` (single property vs whole portfolio); author excluded; unclaimed (`userId:""`) and soft-deleted tenants excluded; cross-owner tenants never included.
  - `resolveStaffRecipients`: owner + custodians of that owner only + property caretakers (or all portfolio caretakers when `propertyId` omitted); dedupe.
  - `notifyAnnouncement`: per-role links (tenant/owner/caretaker/custodian), in-app only.
  - `notifyMessageReply`: custom link used, default preserved, self/empty recipient short-circuits.
  - `notifyComplaintCreated`: now includes a custodian recipient; custodian link.
  - `notifyComplaintStatusChange`: `eventId` includes status → two different statuses both notify; same status dedupes.
  - `notifyMoveRequestCreated`: recipients = staff minus requester; title/body/type/link per role; dedupe key.
  - `notifyMoveRequestDecided`: notifies `requestedById`; skips when `decidedById === requestedById`; tenant link `/dashboard/tenant/requests`; system-admin fallback link; `eventId` per status.
  - All: "never throws" cases keep passing (lookup failure → `[]`/`false`).
- **Route tests (patch existing files):**
  - `announcements/route.test.ts` — POST calls `resolveAnnouncementRecipients` + `notifyAnnouncement` once with the created doc; 400/403 paths call neither.
  - `chat/threads/[id]/messages/route.test.ts` — tenant sender → `notifyMessageReply(msg, agentId, staffLink)`; staff sender → tenant userId + `/dashboard/tenant/messages`; invalid thread → not called.
  - `complaints/route.test.ts` — POST calls `notifyComplaintCreated(created)`.
  - `complaints/[id]/route.test.ts` — status changed → `notifyComplaintStatusChange(updated)`; resolution-only update → not called; same-status PATCH → not called; 404/403 → not called.
  - `move-requests/route.test.ts` — both branches (tenant, staff) call `notifyMoveRequestCreated` once; forbidden paths call neither.
  - `move-requests/[id]/route.test.ts` — `pending → approved` and `pending → rejected` call `notifyMoveRequestDecided`; same-status PATCH → not called.
- **Out of scope for tests:** e2e/browser tests, real MongoDB integration (mocked models per convention), email delivery assertions (already covered), polling-timing tests (already covered by `use-unread-count.test.tsx`).
- Update any pre-existing tests broken by signature changes (`notifyMessageReply`, `notifyComplaintCreated` internals).

## 11. Migration path

- **Additive only.** Two new enum values (validated on new writes), new exported functions, new optional param with a default, new call sites. No data migration, no breaking API changes, no response-shape changes.
- Existing unread rows keep their keys; changing `resolveDedupeKey` precedence cannot collide with old keys (`eventId` is only ever present on rows written by the new orchestrators).
- **Rollback:** revert the call sites and type additions (git revert of the PR). Stored `move-request:*` rows become inert but harmless (TTL removes them within `NOTIFICATION_RETENTION_DAYS`); the client union tolerating extra runtime values is not required because the model enum and client union are reverted together — worst case a stale `move-request:*` row renders via the bell's generic row (title/body/link are self-contained).

## 12. Rollout plan

1. Single PR to `dev`: tasks 1–8 together (call sites and orchestrators are co-dependent).
2. Definition of Done green (`npm run check`, `npm run typecheck`, `npm run test`); CI (biome/typecheck/build/coverage) passes.
3. Manual verification matrix after deploy — for each role (tenant, caretaker, custodian, owner), trigger: announcement publish, tenant→staff and staff→tenant chat message, complaint create, complaint status change, move-request create, move-request decision. Confirm: badge increments ≤30s, dropdown row appears, deep link lands on the right page, author/decider got nothing, second identical event does not double-count (dedupe).
4. Monitor logs for `[notifications] dedupe skipped` storms (would indicate a bad `eventId`) and `[notifications] … failed` warnings.
5. **Rollback trigger:** any cross-role link leak (notification linking a user to content they cannot access) or badge regression → revert PR; no data cleanup needed.

## 13. Open questions

1. **Custodians on invoice/lease notifications** — **Resolved** (70439dc): `notifyInvoicePaid`/`notifyInvoiceOverdue`/`notifyLeaseExpiry` now fan out to the owner's custodians via a shared `resolveCustodianIds` helper (in-app, `/dashboard/custodian/accounting`).
2. **Adjacent bug (security):** `GET /api/v1/complaints` (`complaints/route.ts:39-51`) had no `custodian` branch, so custodians received an unscoped complaint list (all owners). **Resolved** (0c23c86): `filter.ownerId = actor.managedByOwnerId`, matching caretaker scoping, with a route test.
3. **Move-request POST rate limiting** — route has no `rateLimit`/`checkSameOrigin` unlike sibling POSTs; should be a separate hardening PR.
4. **Pending-item widgets on dashboard home** — explicitly out (user chose bell + dropdown); revisit if the bell alone doesn't surface workload fast enough.
5. **Chat: owner-vs-agent double notify** — threads model one staff side (`agentLastReadAt` shared); if a caretaker thread's owner also replies, only the tenant (other side) is notified, not fellow staff. Matches the existing read model; flag if product wants staff-to-staff notify.
