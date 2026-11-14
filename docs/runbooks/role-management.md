# Runbook — system-admin role management

Operational procedure for the system-admin users/roles surface
(`/dashboard/system-admin/users`, `/api/v1/admin/users*`).

This surface can rename roles for every non-system-admin account on the
platform, send invites that activate accounts, and revoke delegated portfolio
authority. It is feature-flagged off by default and hidden (404) while off.

| Item | Value |
|---|---|
| Feature flag | `ROLE_MANAGEMENT_ENABLED` (`src/lib/features.ts`) |
| Guard | `src/app/api/v1/admin/users/_guard.ts` |
| UI | `src/app/dashboard/system-admin/users/page.tsx` |
| Bootstrap CLI | `scripts/grant-system-admin.ts` (`npm run admin:grant`) |
| Audit collection | `audit_events` (`src/lib/audit.ts`) |

---

## 1. Just turned the flag on? Read this first

`ROLE_MANAGEMENT_ENABLED=true` alone is not enough. Three of these are silent
failure modes — the page loads but every action fails.

1. **Redeploy.** Vercel only injects env vars into new deployments. Setting the
   variable does not affect the running build — redeploy (or promote a new
   deployment) after changing it. The flag is read per request, so no code
   change is needed beyond that.
2. **`NEXT_PUBLIC_APP_URL` must equal the production origin exactly.**
   `checkSameOrigin` (`src/lib/rate-limit.ts`) compares the `Origin` header to
   `NEXT_PUBLIC_APP_URL` and 403s `"Invalid origin"` on mismatch. It defaults to
   `http://localhost:3000`, so a production instance with the default rejects
   every mutation (invite, role change) while still rendering the list.
   No trailing slash, `https`, real domain.
3. **An active `system-admin` must already exist** — otherwise every request is
   `403 Forbidden` (the role check runs before the flag check). See §3.
4. **SMTP must be configured for email invites.** If `EMAIL_HOST` /
   `EMAIL_USER` / `EMAIL_PASS` are missing, `sendEmail` logs a warning and
   returns `false`, but the invite endpoint still answers `201 invited: true`.
   The account is created **inactive and unverified** with a verification token
   nobody received. Prefer the phone path, or verify SMTP first.

Verify after redeploy:

```bash
# Should be 200 with a user list (not 404 "Role management is disabled")
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Cookie: keja-token=<system-admin-jwt>" \
  https://<your-domain>/api/v1/admin/users
```

`404` → flag not live in this deployment. `403` → the account is not
`system-admin`. `401` → token missing/expired.

---

## 2. Bootstrapping the first system-admin

The dashboard can never create or remove a `system-admin` (invariant, see §4).
The audited CLI is the only supported path.

```bash
npm run admin:grant -- --email admin@example.com --bootstrap          # dry run
npm run admin:grant -- --email admin@example.com --bootstrap --apply  # commit
```

- `--bootstrap` is refused if **any** active system-admin already exists.
- Dry run is the default; `--apply` is required to write.
- The script loads `.env.local` (via `dotenv.config({ path: ".env.local" })`).
  To operate on a non-local database, point `MONGODB_URI` at that cluster
  **deliberately and temporarily** — the target environment is printed at
  startup (`Connecting to MongoDB at …`); read it before passing `--apply`.
- Each run writes an `audit_events` row (`action: "user.role_changed"`).

After bootstrap, the operator signs in again (the token embeds the role) and
the surface becomes usable.

---

## 3. Enabling / disabling the flag

| Environment | Where | Rollback |
|---|---|---|
| Local | `.env.local` (gitignored) | remove the line, restart `next dev` |
| Vercel | Project → Settings → Environment Variables → Production (and Preview if wanted) | set `false`, redeploy |

Keep `.env.example` at `false` — it is the documented default and the only
place a new environment learns the surface exists.

Disabling is the **kill switch**: requests then return `404` (deliberately
indistinguishable from "no such route") and the UI renders "Role management
disabled". Data is untouched. The CLI still works with the flag off — do not
assume a disabled flag means a demotion is impossible.

---

## 4. What the surface can and cannot do

| Operation | Dashboard | Endpoint | Notes |
|---|---|---|---|
| List / search users | yes | `GET /api/v1/admin/users` | 20 req/min per IP |
| Invite a user | yes | `POST /api/v1/admin/users` | 20 req/min; staff roles require `ownerId` |
| Change a role | yes | `PATCH /api/v1/admin/users/[id]/role` | 30 req/min |
| Grant/revoke `system-admin` | **no** | CLI only | see §5 |
| Deactivate / reactivate a user | **no** | — | not implemented; `isActive` is read-only in the UI |

Invariants enforced server-side (`src/app/api/v1/admin/users/[id]/role/route.ts`):

- `system-admin` is not an assignable target role, and `system-admin` targets
  are rejected — CLI only.
- An actor cannot change their own role.
- **Audit-first, fail closed**: the audit event is written before the mutation;
  if it fails the change is aborted with `500 Audit unavailable; role change
  aborted`. If you see this, fix the `audit_events` write path — do not retry
  blindly.
- Every role change bumps the target's `tokenVersion` (their sessions are
  invalidated → forced re-login) and **revokes all their ManagementAssignment
  rows** (`active`/`pending`/`suspended` → `revoked`). A demoted admin loses
  portfolio access immediately but must be re-assigned if later promoted back.
- Broker demotion also suspends the broker profile (`status: "suspended"`).
- Invited accounts are created `isActive: false, isVerified: false` until the
  verification link is used.

---

## 5. Granting or revoking `system-admin` (two-person control)

```bash
# Grant (needs a *different* existing system-admin as operator)
npm run admin:grant -- --email new@example.com \
  --operator-email root@example.com --reason "on-call rotation"          # dry run
npm run admin:grant -- --email new@example.com \
  --operator-email root@example.com --reason "on-call rotation" --apply

# Revoke (same shape, plus a target role)
npm run admin:grant -- --email leaving@example.com \
  --operator-email root@example.com --revoke --to-role admin --apply
```

- The operator must be an **active system-admin != target** — no self-demotion.
- Revocation refuses to drop the active system-admin count below `--min-admins`
  (default `2`). Overriding is explicit and deliberate:
  `--min-admins 1`.
- The target's `tokenVersion` is bumped and privileges cleared, so a revoked
  admin loses access at the next request, not at token expiry.
- Bootstrap runs are audited with `actorUserId: "bootstrap-cli"` — expected
  exactly once per environment, and never on a cluster that already has admins.

Recommended posture: keep **at least two** active system-admins so the CLI is
never blocked on a single human, and record the reason for every grant/revoke.

---

## 6. Monitoring

```js
// recent role-management activity
db.audit_events.find(
  { action: { $in: ["user.role_changed", "user.created", "user.invited"] } },
  { actorUserId: 1, actorRole: 1, action: 1, entityId: 1, before: 1, after: 1, createdAt: 1 }
).sort({ createdAt: -1 }).limit(50)
```

Alert-worthy:

- `user.role_changed` where `after.role` is `admin` and the actor is unexpected.
- `500 Audit unavailable` in logs — the surface is fail-closed, so the operator
  sees a failure; the real issue is the audit write path.
- `403 Invalid origin` on production — `NEXT_PUBLIC_APP_URL` drift (§1).
- `404` on `/api/v1/admin/users` from a signed-in system-admin — flag or
  deployment drift (§1).

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Role management disabled" / `404` | flag off in the running deployment | set `ROLE_MANAGEMENT_ENABLED=true`, **redeploy** |
| `403 Forbidden`, no message | account is not `system-admin` | bootstrap/grant via CLI (§2, §5) |
| `403 Invalid origin` on every action | `NEXT_PUBLIC_APP_URL` ≠ real origin | fix the env var, redeploy |
| `401 Session expired` | `tokenVersion` bumped (role changed / revoked) | sign in again |
| Invite returns 201 but no email | SMTP unset or send failed (logged, swallowed) | configure `EMAIL_*`, resend; account stays inactive until verified |
| Invited user "can't log in" | account inactive until the verification link is used | resend invite / verify token |
| Role change `500 Audit unavailable` | `audit_events` insert failed | fix audit path, then retry |

---

## 8. Known gaps

- **No deactivation path.** `isActive` is filterable in the UI but not editable;
  offboarding currently means a database write. Prefer adding an endpoint over
  ad-hoc edits.
- **CLI still lists `owner` as an assignable target role**
  (`ASSIGNABLE_ROLES` in `scripts/grant-system-admin.ts`), left over from the
  owner retirement. Granting it would set a role the app no longer recognises.
- **Stale comment** in `src/lib/role-management.ts` claims `owner` is retained
  in `USER_ROLES`; it is not.
- **The CLI reads `.env.local`**, so operating on production requires
  temporarily pointing a local file at the production cluster — a footgun worth
  replacing with an explicit `--env-file`/`MONGODB_URI` override.
