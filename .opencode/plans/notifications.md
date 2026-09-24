# Keja Yangu — Notifications

## 1. Summary

Add an in-app notification store (Mongo) with best-effort email delivery (existing nodemailer infra) and a dashboard bell. A `Notification` model persists one row per recipient per event; a service layer (`src/lib/notifications.ts`) fans out invoice-paid/overdue, lease-expiry, complaint, chat-reply, and announcement events with dedupe keys; a small REST inbox API (list, unread count, mark-read, mark-all-read) is polled by the client. Invoice events are wired now; complaint/chat/announcement/Paystack call sites are defined seams that fire when those features ship. User notification preferences migrate from localStorage to an embedded `settings` subdocument on `User`, gating outbound email.

## 2. Scope

### In
- `Notification` Mongo model (per-recipient rows, TTL retention, dedupe index).
- `src/lib/notifications.ts` service: `notifyUser`, `wantsEmailNotifications`, 7 orchestrators (`notifyInvoicePaid`, `notifyInvoiceOverdue`, `notifyLeaseExpiry`, `notifyComplaintCreated`, `notifyComplaintStatusChange`, `notifyMessageReply`, `notifyAnnouncement`), overdue catch-up sweep `notifyOverdueInvoices`.
- Inbox API: `GET /api/v1/notifications`, `GET /api/v1/notifications/unread-count`, `PATCH /api/v1/notifications/[id]`, `POST /api/v1/notifications/mark-all-read`.
- New permission actions `notification:read-own`, `notification:manage`, `settings:read`, `settings:write`.
- Email builders in `src/lib/email.ts` (`sendNotificationEmail` + `create*Content`), no-cron lazy triggers for overdue (GET `status=overdue` sweep) and lease-expiry (invoice generate seam).
- Frontend: `use-notifications` hook, `use-unread-count` hook (30s poll, pause when hidden), `NotificationsBell` component mounted in `DashboardShell` header.
- Settings: embed `settings` subdocument on `User`, `GET/PATCH /api/v1/settings`, `use-settings` hook, migrate the 3 settings pages off `settingsStore`.

### Out
- Websockets/SSE — 30s polling only.
- Chat/complaint/announcement UI and routes (separate plan) — only the notify seam is defined here.
- Cron for overdue/lease-expiry (lazy sweeps this round; `notifyOverdueInvoices` is the reusable core).
- Notification DELETE, un-read toggle.
- `@radix-ui/react-dropdown-menu` / `popover` — the bell uses a hand-rolled absolutely-positioned panel.
- Migrating `ThemeProvider` theme handling (stays on `keja-theme` localStorage).
- "View all" notifications page; per-message chat emails; announcement email broadcasts gated on `marketingEmails` later.
- Changing `renderTemplate`/`createEmailTemplate` (auth email code untouched).

## 3. Architecture

```
Routes (mark-paid, tenant mark-paid, paystack settle, generate, future complaint/chat/announcement)
   │  await notifyX(doc)  (single seam call, never throws)
   ▼
src/lib/notifications.ts ── resolves recipients (Tenant.userId / ownerId / Property.caretakerIds)
   │   ── builds type/role-aware title, body, deep-link, email content
   ├──► Notification.create (dedupeKey unique partial index; E11000 → skip)
   └──► sendEmail (best-effort, gated by wantsEmailNotifications) → set emailSentAt

Client: useUnreadCount(30s poll) → Bell badge
        useNotifications() → list; PATCH mark-read; POST mark-all-read
```

Data flow: an event doc → one `notifyX` call → N `notifyUser` rows (fan-out) → in-app always, email best-effort. Duplicates impossible within a row's lifetime via the dedupe index.

## 4. What to do

- **`src/models/Notification.ts`**: `NOTIFICATION_TYPES = ["invoice:paid","invoice:overdue","lease:expiring","complaint:created","complaint:status-changed","chat:reply","announcement"]`; `NOTIFICATION_CHANNELS = ["in-app","email"]`. Fields: `recipientUserId (required)`, `recipientRole?`, `type (enum, required)`, `title (required)`, `body (required)`, `data (Mixed, default {})` (invoiceId/leaseId/complaintId/propertyId/messageId/announcementId/period/amountDue), `link (default "")` role-aware path, `channels (default ["in-app"])`, `readAt?`, `emailSentAt?`, `dedupeKey (default "")`. Indexes: `{recipientUserId, createdAt:-1}`; `{recipientUserId, readAt}`; `{createdAt}` TTL `expireAfterSeconds` from `NOTIFICATION_RETENTION_DAYS ?? 90`; `{recipientUserId, dedupeKey}` unique partial (`dedupeKey: {$ne:""}`). `serializeNotification` (dates → ISO, `data`/`link`/`channels` defaulted, `readAt`/`emailSentAt` null).
- **`src/lib/notifications.ts`**:
  - `notifyUser(userId, {type,title,body,data?,link?,channels?,email?})` → compute `dedupeKey = data.invoiceId ?? leaseId ?? complaintId ?? announcementId ?? messageId ?? threadId ?? ""`; `Notification.create`; on `isDuplicateKeyError` → log + return true; if channels includes email && `isEmailConfigured()` && `wantsEmailNotifications(userId)` → `sendEmail`, on true set `emailSentAt`. **Never throws.** `recipientRole` resolved via one lean `User.findById`.
  - `wantsEmailNotifications(userId)` — lean read `settings.emailNotifications`; missing → enabled.
  - Orchestrators (each never throws): recipient matrix — invoice paid/overdue: tenant user (via `Tenant.findById(invoice.tenantId).select("userId")`, skip `userId===""`), owner (`invoice.ownerId`), caretakers (via `Property.caretakerIds`). Tenant gets in-app+email; staff in-app only. Lease expiry: tenant + owner email, caretaker in-app. Complaint created: staff in-app (+email if priority high). Complaint status change: tenant in-app+email. Message reply: non-sender in-app. Announcement: per audience in-app.
  - `notifyOverdueInvoices(now, scope)` — `Invoice.find({status:"pending", dueDate:{$lt:now}, ...scopeFilter}).sort({dueDate:1}).limit(200)`; resolve + notify with `dedupeKey "invoice:overdue:<id>"`.
  - `notifyLeaseExpiry(lease)` dedupeKey `lease:expiring:<id>`.
- **`src/lib/email.ts`** (extend, don't refactor): `sendNotificationEmail({to, subjectPrefix, content, text, linkUrl, preheader})` wrapping `renderTemplate(content, linkUrl, preheader)` + `sendEmail(subject: uniqueSubject(...))`. Builders `createInvoicePaidContent`, `createInvoicePaidStaffContent`, `createOverdueContent`, `createLeaseExpiryContent`, `createComplaintStatusContent`, `createAnnouncementContent` using `formatKES`/`formatPeriod`; rule documented: content only uses `{{APP_URL}}`, caller passes the absolute deep link as `url`.
- **Permissions** (`src/lib/permissions.ts`): extend `Action` with the 4 actions; tenant branch allow-list adds them; caretaker switch adds 4 `return null` cases (own-scope, no privilege needed).
- **Routes** (all own-only, `requirePermission` + `authenticate().userId`, no bodies):
  - `GET /api/v1/notifications` — paginated `buildPaginationResult`, filters `unread=true` (`readAt:null`), `type`; default limit 20.
  - `GET /api/v1/notifications/unread-count` — `{count}` (no envelope).
  - `PATCH /api/v1/notifications/[id]` — `rateLimit 20/min` + `checkSameOrigin` + `isValidObjectId`→400; `findOneAndUpdate({_id, recipientUserId}, {$set:{readAt:new Date()}})` → 404 own-only; idempotent 200.
  - `POST /api/v1/notifications/mark-all-read` — `updateMany({recipientUserId, readAt:null}, ...)`.
- **Call sites now**: `mark-paid/route.ts` + `tenant/me/invoices/[id]/route.ts` after settle → `await notifyInvoicePaid(updated)`. `invoices/route.ts` GET and `tenant/me/invoices/route.ts` GET **only when `status=overdue`** → `await notifyOverdueInvoices(now, scope)`. `invoices/generate/route.ts` after leases loaded → expiring leases within 30 days → `await notifyLeaseExpiry(lease)`.
- **Settings**: `User.settings` subdocument (`_id:false`) with `emailNotifications=true, smsNotifications=true, marketingEmails=false, moderationReminders=true, language="en", theme="system"`. `GET/PATCH /api/v1/settings` (`settings:read`/`settings:write`; PATCH uses dotted-path `$set` via new `src/lib/schemas/settings.ts`). `use-settings.ts` hook with optimistic PATCH.
- **Frontend**: `use-notifications.tsx` (list + refetch, mirrors `use-my-invoices`), `use-unread-count.tsx` (fetch on mount, `setInterval` 30s early-returning on hidden, refetch on `visibilitychange`), `NotificationsBell.tsx` (ghost icon button + absolute-positioned panel `absolute right-0 top-full mt-2 w-80 rounded-2xl border border-border bg-card p-2 shadow-soft`, outside `pointerdown` + Escape close, unread pill like chat, rows → `markRead` + `router.push(link)`), mounted in `DashboardShell` before `<ThemeToggle/>`.
- Migrate tenant/caretaker/owner settings pages to `useSettings`; remove `settingsStore`/`updateSettings`/`UserSettings` from `src/data/dashboard.ts`.
- **`src/test/utils/model-mocks.ts`**: add `notification` stub; factories `makeNotification`.

## 5. What NOT to do

- No websockets/SSE.
- No per-message email on chat (`chat:reply` in-app only).
- No DELETE route, no un-read toggle (TTL is the only deletion; `readAt` only moves forward).
- Don't resolve `recipientRole` from the Tenant row — role belongs to the User.
- Email never throws into the request path; `notifyUser`/orchestrators never throw.
- No new Radix dropdown-menu/popover dependency.
- Don't store rendered email HTML on the doc (build/send/discard).
- Don't touch `renderTemplate`/`createEmailTemplate`/`createVerificationContent` etc.
- Don't sweep overdue on every GET — gate on `status=overdue`.
- Don't migrate `ThemeProvider` theme handling.
- Don't resolve recipients or build `link` per-client — server composes role-aware `link`.

## 6. Security considerations

- All routes own-only: mark-read `findOneAndUpdate({_id, recipientUserId})` never reveals foreign docs.
- `title`/`body`/`data` built server-side from DB fields only; React escapes.
- `isDuplicateKeyError` reuse for dedupe races.
- `emailNotifications` gate honored before any outbound email; SMTP unconfigured short-circuits.
- Deep links are snapshot strings within the TTL window.

## 7. Performance considerations

- Unread-count endpoint is a single `countDocuments` polled every 30s — cheap; index `{recipientUserId, readAt}` covers it.
- Overdue sweep bounded by `limit(200)` and only fires on `status=overdue` reads.
- Paginated list (default 20, capped 100) with `{recipientUserId, createdAt:-1}` index.
- Email is synchronous currently (transport `maxConnections:1`); acceptable at this volume — `void` fire-and-forget is the escape hatch if needed.

## 8. DevOps and observability

- `NOTIFICATION_RETENTION_DAYS` env (default 90).
- Email infra unchanged (`EMAIL_*`).
- Log `[notifications] recipient type dedupeKey emailSent:<bool>` warnings only; never log bodies.
- No CI/CD changes.

## 9. Implementation tasks

1. `src/models/Notification.ts` + model-mocks/factories.
2. `src/lib/notifications.ts` service + `notifications.test.ts`.
3. `src/lib/email.ts` builders + `sendNotificationEmail`.
4. Permissions actions + tests.
5. Inbox routes + route tests.
6. Invoice route call-site wiring (paid, overdue sweep, lease expiry) + update existing tests.
7. `User.settings` subdocument + `/api/v1/settings` + schemas + route tests.
8. `use-notifications`, `use-unread-count`, `NotificationsBell` + tests; mount in `DashboardShell`.
9. Settings pages migration + remove `settingsStore`; README API table.

## 10. Testing strategy

- `notifications.test.ts`: `notifyUser` dedupe (same key twice → one row), email skipped on unconfigured/prefs-off, never throws, `wantsEmailNotifications` default-on; orchestrator recipient resolution (tenant bound vs `userId===""` skips, owner, caretakers); overdue sweep scope/limit/dedupe.
- Route tests (`buildRequest` convention): list own-only + pagination; unread-count exact count; PATCH own-only (foreign → 404), idempotent already-read; mark-all-read modifies only own unread; middleware order (`rateLimit`, `checkSameOrigin`, `isValidObjectId`).
- `settings/route.test.ts`: GET defaults for missing settings; PATCH dotted-path merge (unspecified fields survive); invalid body 400.
- Hook/component tests (jsdom): poll pauses on hidden; markRead optimistic + rollback; bell renders rows, unread pill, outside-click closes.
- Update existing invoice route tests for the new post-settle `notifyInvoicePaid` calls (mock service).

## 11. Migration path

- Additive: new model, routes, env, `User.settings` defaults. Existing users get defaults via `settings ?? DEFAULT_SETTINGS`.
- localStorage settings left behind are ignored (no one-time seeding).
- Rollback: remove routes/service/bell; invoice routes revert; `settingsStore` restore if needed.

## 12. Rollout plan

- Ship invoice-event wiring first; bell + settings together. Verify staff and tenant dashboards get correct unread counts and deep links.
- Monitor email delivery; confirm `emailSentAt` set when SMTP configured.

## 13. Open questions

1. Unclaimed tenants (`Tenant.userId===""`) — skip entirely (chosen) vs email `Tenant.email` as a system bypass; confirmed skip this round.
2. Announcement emails — in-app only initially, gated by `marketingEmails` later (chosen).
3. High-priority complaints email staff? Default in-app only.
4. "View all" page deferred (chosen).
5. Synchronous email latency acceptable; `void` escape hatch available.