# Plan — Phone-or-email accounts + unified team invitations

Status: **IMPLEMENTED (code)** · Date: 2026-10-30 · Author: inline

> Phases 1–5 are shipped. Phase 6 code/docs and the automated verification
> suite are complete; the staging migration run (T6.2) and manual end-to-end
> pass (T6.4) remain operational follow-ups.

## 1. Request

1. The add/invite-tenant flow (owner, custodian, caretaker) must allow account creation with
   **either an email address or a phone number**, alongside the other tenant fields. A person
   with only a phone number must be able to have an account.
2. Because accounts may have no email, sign-in must accept **phone + password** or
   **email + password**.
3. On the owner/custodian team screens, the **same invite form used for custodians must also
   invite caretakers**. The only difference is a **role dropdown** selecting custodian or
   caretaker.
4. Custodians should exercise **owner-equivalent portfolio powers**, with two hard exceptions:
   they may not remove the owner, and they may not add/edit/remove another user at their own
   level (i.e. another custodian). Privilege assignment is delegated by the owner, or by a
   custodian the owner has marked as privileged.

### Confirmed decisions

- **Owner team:** the owner may invite custodians, caretakers, and other lower-level team
  members. The owner is the only person who can add, edit, or revoke a custodian.
- **Custodian team:** custodians may invite caretakers and exercise owner-equivalent
  portfolio/operations powers. They may **never** invite, edit, or revoke another custodian,
  and may never remove/deactivate the owner (`src/lib/permissions.ts:184-187` keeps the
  custodian-management restriction).
- **Privilege delegation:** the owner may mark a custodian as **privileged**. Only the owner, a
  system-admin, or a privileged custodian may change caretaker privileges. A privileged
  custodian cannot promote another custodian, edit a peer custodian, or remove the owner.
- **System-admin:** remains the platform-level role with its existing cross-portfolio powers.
  This plan does not reduce system-admin capabilities; it defines owner/custodian delegation
  inside a portfolio.
- **Phone-only accounts:** create an active, verified account with a **generated temporary
  password**, returned once to the authenticated inviter. There is no SMS/WhatsApp delivery yet.
  This mirrors the existing phone-only custodian flow (`src/app/api/v1/custodians/route.ts:115-170`).

## 2. Current-state audit (verified against the repo)

| Area | State | Gap |
|---|---|---|
| Sign-in | `POST /api/auth {action:"signin"}` accepts `identifier` and falls back from email lookup to phone lookup (`src/app/api/auth/route.ts:108-115`). | Phone lookup uses the raw typed value, so `0712…` or `254712…` will not match a stored `+254712…`. Self-signup is still email-only. |
| User model | `email` is optional with a unique sparse index; `phone` is a non-unique index (`src/models/User.ts:44`, `:73`, `:90-91`). | Duplicate phone accounts are possible, making phone sign-in ambiguous. |
| Tenant model | `Tenant.email` is **required** (`src/models/Tenant.ts:23`); unique index is `{propertyId,email}` (`:50-53`). | The API's phone-only branch creates a tenant with no email (`src/app/api/v1/tenants/route.ts:228-261`), which cannot pass model validation. |
| Tenant API input | Zod already allows `email` OR `phone` (`src/app/api/v1/tenants/route.ts:100-110`) and has a phone-only branch. | Branch is unreachable in practice because the model requires email; identity resolution by phone is incomplete. |
| Tenant UI | Email is required in validation and in the dialog (`src/components/tenants/TenantsManager.tsx:190-193`, `:475-483`); `TenantInput.email` is required. | Cannot add a phone-only tenant. The generated password returned by the API is ignored. |
| Custodian invite API | Supports email magic-link and phone-only accounts; returns `password` for phone-only (`src/app/api/v1/custodians/route.ts:115-170`, `:184-238`). | UI always requires email. |
| Caretaker invite API | Email is required (`src/app/api/v1/caretakers/route.ts:13-17`). New invitees get a verification token stored on the user, but the email is sent **without the token** (`:154`), so it falls back to the non-magic `/auth?invited=…` link. | No phone-only path; no tokenised magic link. |
| Caretaker scoping | GET/POST bind to `String(user._id)` for every non-system-admin actor (`src/app/api/v1/caretakers/route.ts:55-58`, `:105`). | A custodian actor's caretakers are bound to the **owner** id (`managedByOwnerId`), not the custodian id, so the custodian team page is empty and cannot invite. POST also rejects custodians entirely. |
| Team UI | Owner page combines `CustodianManager` + `CaretakerPrivilegesTable` (`src/app/dashboard/owner/team/page.tsx`). Custodian page has only the privileges table (`src/app/dashboard/custodian/team/page.tsx`). | No shared invite form and no role dropdown. |
| Team authority | Custodians already get owner-equivalent portfolio actions in `requirePermission`, but are explicitly blocked from `custodian:manage` (`src/lib/permissions.ts:178-187`). Caretaker privilege writes are not gated by any custodian-level delegation token. | No “privileged custodian” concept; no way for an owner to delegate privilege assignment; no explicit owner-protection guard/test. |
| Client types | `Tenant.email`, `CaretakerRow.email`, and `KejaUser.email` are typed as required strings. | Need optional email handling for phone-only accounts. |

## 3. Identity model and invariants

These rules apply to every creation path (tenant, caretaker, custodian, signup).

1. **At least one contact is required:** `email` or `phone`.
2. **Email** is trimmed and lowercased. It remains optional on `User` and becomes optional on
   `Tenant`.
3. **Phone** is stored only in E.164 (`+254712345678`). All form input is composed with the
   country-code selector and `toE164`; API callers are normalized with
   `normalizeStoredPhone`/`isValidE164` (`src/lib/phone.ts`).
4. **One account per identity:** a non-empty email or phone identifies exactly one `User`
   across roles. If an invite's contact already belongs to a different role or a different
   owner, return `409` rather than silently linking or duplicating.
5. **Email-present invitations** create/refresh an inactive, unverified user, mint a
   `verificationToken` (24h) and send the existing magic link.
6. **Phone-only invitations** create/activate a verified user immediately with a generated
   temporary password, returned once as `password` in the authenticated response. It is never
   logged or persisted in plaintext.
7. **Email + phone together** use the email invite path and attach the phone to the same
   account. If the phone already belongs to another account, return `409`.
8. **Sign-in** normalizes the identifier before lookup: email-like values are lowercased;
   digit-like values are normalized to E.164. Email lookup runs first, then phone lookup.
9. **No phone-only password recovery** in this scope (no SMS provider). Phone-only users can
   change their password from the authenticated profile form. SMS/OTP recovery is a follow-up.

### 3.1 Role and delegation invariants

Use `managedByOwnerId` as the portfolio boundary for every team action. All comparisons below
are within that owner's portfolio.

| Actor | Invite custodian | Invite caretaker | Assign caretaker privileges | Edit/revoke custodian | Remove owner |
|---|---|---|---|---|---|
| Owner | Yes | Yes | Yes | Yes | No (owner is protected) |
| System-admin | Yes (existing) | Yes (existing) | Yes (existing) | Yes (existing) | Platform-controlled |
| Custodian | **No** | Yes | No | **No** | **No** |
| Privileged custodian | **No** | Yes | Yes | **No** | **No** |
| Caretaker | No | No | No | No | No |

Implementation rules:

1. Add a custodian-only privilege token, e.g. `"assign_privileges"`, to the existing
   `User.privileges` enum. A custodian is **privileged** when its `privileges` array contains
   that token. Do not reuse caretaker action tokens for custodians.
2. Add `isPrivilegedCustodian(user)` to `src/lib/permissions.ts`. It must require
   `role === "custodian"`, a non-empty `managedByOwnerId`, active status, and the
   `assign_privileges` token.
3. Keep `custodian:manage` owner/system-admin only. Do not relax it for privileged custodians.
4. Extend the caretaker-privilege endpoint so it requires owner, system-admin, or privileged
   custodian. Scope privileged custodians to `managedByOwnerId` and reject cross-owner changes.
5. Owner-only: grant/revoke the custodian `assign_privileges` token. Expose it in the owner's
   custodian list as a “Privileged” toggle/badge.
6. There is no owner-removal path today. Add a regression test proving custodian/caretaker
   calls cannot deactivate or delete the owner through any team endpoint.

## 4. Delivery phases

### Phase 1 — Data model and identity helpers

**Goal:** make phone-only identities valid and unambiguous at the data layer.

**Files**
- Modify `src/models/User.ts`
  - Make the TypeScript `email` field optional.
  - Replace `userSchema.index({ phone: 1 })` with a unique partial index on non-empty phones,
    e.g. `{ phone: 1 }` with `partialFilterExpression: { phone: { $type: "string", $ne: "" } }`.
  - Keep the sparse unique email index.
- Modify `src/models/Tenant.ts`
  - `email` → `required: false`.
  - Make the email unique index partial on non-empty email + `deletedAt: null`.
  - Add a partial unique `{ propertyId, phone }` index for non-empty phones + `deletedAt: null`.
  - Update `ITenant.email` to optional.
- Create `src/lib/user-identity.ts` (shared by all invite routes)
  - `normalizeContactEmail(value)`.
  - `normalizeContactPhone(value)` (delegates to `normalizeStoredPhone` + `isValidE164`).
  - `resolveUserByContact({ email, phone })` returning either a user or a typed conflict
    (`role-conflict`, `owner-conflict`, `identity-conflict`).
  - `createPhoneOnlyAccount({ role, name, phone, managedByOwnerId? })` returning the created
    user + generated plaintext password (caller returns it once).
- Create `scripts/normalize-user-phone-identity.ts`
  - Normalize legacy `phone` values to E.164 with `normalizeStoredPhone`.
  - Report (do not auto-merge) duplicate phones; require a manual decision.
  - Unset empty-string phones so the partial unique index can be created.
  - Follow the pattern of `scripts/backfill-phone-e164.ts`.

**Tasks**
- [x] T1.1 Add identity helpers + unit tests (`user-identity.test.ts`).
- [x] T1.2 Update `User`/`Tenant` models and indexes.
- [x] T1.3 Add the normalization/dedupe report script and document the manual merge step.
- [x] T1.4 Update `Tenant`/`User` fixture factories so optional email is supported.

**Review focus:** do not create a unique index before the migration has removed empty strings
and duplicates, or index creation will fail on existing data.

---

### Phase 2 — Sign-in and profile support for phone-only accounts

**Goal:** a phone-only account can sign in with `phone + password`; email accounts keep working.

**Files**
- Modify `src/app/api/auth/route.ts`
  - In `signin`, after trimming: if the identifier contains `@`, lowercase it for the email
    lookup; otherwise normalize with `normalizeStoredPhone` and look up the normalized phone.
  - Keep a fallback to the raw value for back-compat during the migration window.
  - Do not change the password rules in this phase.
- Modify `src/app/api/auth/me/route.ts` / `src/app/api/v1/users/me/route.ts`
  - Keep returning `email: user.email ?? ""` for client compatibility; no behavior change.
- Modify `src/hooks/use-auth.tsx`
  - `KejaUser.email` becomes optional (`email?: string`).
  - Keep `signIn(identifier, password)` unchanged.
- Audit client surfaces that assume an email is present (settings profile card, team tables,
  search) and use a phone fallback where an email would otherwise render blank.

**Tasks**
- [x] T2.1 Failing tests: sign in with E.164 phone; sign in with local `07…`/`254…` phone;
      sign in with email still works; wrong password still 401.
- [x] T2.2 Implement identifier normalization in `signin`.
- [x] T2.3 Update client types and blank-email fallbacks.
- [x] T2.4 Run auth route + hook tests.

---

### Phase 3 — Tenant add/invite supports email OR phone

**Goal:** an owner/custodian/caretaker can add a tenant with either contact; a phone-only
tenant gets an immediately usable account.

**API — `src/app/api/v1/tenants/route.ts`**
- Keep the existing `email || phone` zod refinement.
- Normalize email/phone before any lookup/creation.
- Replace the ad-hoc `existingUserQuery` and the email-only pre-create with
  `resolveUserByContact`:
  - Existing active user with the same role → link the `Tenant.userId`.
  - Existing pending invite with the same role → refresh the token and resend the invite.
  - Existing user with a different role, or a caretaker/custodian bound to another owner →
    `409` with a clear error.
- Phone-only branch:
  - Create the `User` with `email` unset (not `""`), `isActive: true`, `isVerified: true`,
    `role: "tenant"`, and the generated password hash.
  - Create the `Tenant` with `email` unset and the phone.
  - Return `{ created: true, password, data }` (keep the existing response key so the hook and
    tests stay stable).
- Email branch: keep the magic-link invite; ensure a pre-created `User` is not duplicated when
  the email already exists.
- Duplicate check: only compare the contacts actually supplied; do not require both email and
  phone to match.

**API — `src/app/api/v1/tenants/[id]/route.ts`**
- Allow clearing/keeping an email or phone on update while always leaving at least one contact.
- Update duplicate checks to use the resolved next email/phone, not only email.

**Client — `src/hooks/use-tenants.tsx`**
- `Tenant.email?: string`, `TenantInput.email?: string`.
- `createTenant` returns `{ tenant, temporaryPassword? }` or expose the raw `password` from the
  response so the dialog can display it once.

**UI — `src/components/tenants/TenantsManager.tsx`**
- Replace the email-required validation with: name, property, and **at least one of email or
  phone** required. Validate email only when present; validate E.164 phone when present.
- Replace the free-text phone input with `CountryCodeSelect` + national input (as in the auth
  signup and account settings forms).
- Label the contact section “Email or phone” and add helper copy: “Provide at least one. A
  phone-only tenant gets a temporary password you can share.”
- On phone-only success, open a one-time credentials dialog showing the phone and temporary
  password with a copy button. Do not show it for email invitations.
- Table: show `—` (or the phone) when email is absent; make search tolerate undefined email.

**Tasks**
- [x] T3.1 Route tests: phone-only tenant succeeds; email-only invite succeeds; both succeed;
      neither → 400; existing-role conflict → 409; duplicate tenant contact → 409.
- [x] T3.2 Model/index changes from Phase 1 verified by a route-level create.
- [x] T3.3 Update `useTenantMutations`/types.
- [x] T3.4 Update `TenantsManager` validation, phone input, credentials dialog, tests.
- [x] T3.5 Update existing `TenantsManager.test.tsx` expectations that email is required.

---

### Phase 4 — Caretaker invite parity + custodian scoping

**Goal:** caretaker invites work exactly like custodian invites (email magic link or phone-only),
and custodians can invite/see caretakers under their owner.

**API — `src/app/api/v1/caretakers/route.ts`**
- Schema: `email` optional; refine to require email OR phone; add optional `ownerId` for
  system-admin invites; keep optional `name`, `phone`, `privileges`.
- Normalize contacts and resolve identity with `resolveUserByContact`.
- Actor scoping:
  - Owner → `managedByOwnerId = String(actor._id)`.
  - Custodian → `managedByOwnerId = actor.managedByOwnerId` (new; required non-empty).
  - System-admin → `ownerId` from the body (required, like custodians).
  - Keep caretaker/tenant forbidden.
- Allowed actor roles: owner, custodian, system-admin.
- GET:
  - Owner filters by `String(user._id)`.
  - Custodian filters by `user.managedByOwnerId` (fixes the empty team page).
  - System-admin filters by the optional `ownerId` query.
  - Select and return `phone` in addition to the existing fields.
- Email invite:
  - Create inactive/unverified user with `verificationToken`/expiry.
  - Pass the token to `sendInviteEmail(email, name, "caretaker", verificationToken)` — this is
    the current bug at `:154`.
- Phone-only invite:
  - Create an active, verified caretaker bound to the owner with a generated password.
  - Return `{ created: true, password, data }`.
- Existing-user handling:
  - Pending invite at the same owner → refresh token, update name/phone/privileges, resend.
  - Active caretaker at the same owner → link/update, no new invite.
  - Active caretaker at another owner → 409.
  - Different role → 409.

**API — `src/app/api/v1/custodians/route.ts`**
- Keep the current role policy (owner/system-admin only).
- Reuse `resolveUserByContact` and `createPhoneOnlyAccount` so the behavior matches caretakers.
- Ensure the UI can rely on the same response shape (`password` for phone-only).

**Tasks**
- [x] T4.1 Failing tests: custodian actor sees caretakers bound to their owner; custodian actor
      invites a caretaker; phone-only caretaker is active/verified; email invite receives the
      token; re-inviting an existing caretaker refreshes the token; role/owner conflicts → 409.
- [x] T4.2 Implement scoping and invite parity.
- [x] T4.3 Update divider/custodian route tests for shared helper behavior.

**Review focus:** a caretaker must never be able to invite anyone. The custodian actor must
never be able to invite a custodian (confirmed decision).

---

### Phase 4B — Privileged custodians and delegated privilege assignment

**Goal:** let the owner delegate caretaker-privilege management to a trusted custodian without
letting any custodian escalate to peer-custodian or owner management.

**API / RBAC**
- `src/lib/permissions.ts`
  - Add the custodian token `assign_privileges` to the `User.privileges` enum/schema.
  - Add `isPrivilegedCustodian(user)` as described in §3.1.
  - Keep `custodian:manage` owner/system-admin only.
- `src/app/api/v1/caretakers/[id]/privileges/route.ts`
  - Allow actor roles: owner, system-admin, **privileged custodian**.
  - A privileged custodian may only update caretakers whose `managedByOwnerId` matches their
    own `managedByOwnerId`; otherwise `403`.
  - A non-privileged custodian gets `403` (they can still invite caretakers through the
    caretaker POST route, but cannot edit privileges).
- `src/app/api/v1/custodians/[id]/route.ts`
  - Keep edit/revoke owner/system-admin only (no custodian peer management).
- Add a small owner/system-admin-only write path for the `assign_privileges` token, e.g. extend
  `PATCH /api/v1/custodians/[id]` with `privileges` (owner/system-admin only) or add
  `PUT /api/v1/custodians/[id]/privileges`.
  - Reject unknown privilege tokens.
  - Reject attempts by custodians (even privileged ones) to change another custodian.
- Regression test: no team endpoint can deactivate/delete the owner.

**UI**
- `src/components/team/CustodianManager.tsx`
  - Show a “Privileged” badge for custodians with `assign_privileges`.
  - Owner/system-admin only: a toggle to grant/revoke it.
- `src/components/team/CaretakerPrivilegesTable.tsx`
  - Accept a `canAssign` prop; owner and privileged custodians see active toggles.
  - Non-privileged custodians see read-only state (or the table is hidden behind a message).
- `src/app/dashboard/custodian/team/page.tsx`
  - Derive `canAssign` from the signed-in user (`role === "custodian"` and
    `privileges.includes("assign_privileges")`).
- `src/app/dashboard/owner/team/page.tsx`
  - Always passes `canAssign`.

**Tasks**
- [x] T4B.1 Add `assign_privileges` to the model + permission helpers with unit tests.
- [x] T4B.2 Enforce privileged-custodian scoping on the caretaker-privilege endpoint.
- [x] T4B.3 Add the owner-only custodian privilege toggle + API.
- [x] T4B.4 Wire `canAssign` through the team pages and update component tests.
- [x] T4B.5 Test that custodians cannot add/edit/revoke custodians and cannot remove the owner.

---

### Phase 5 — Unified team invite UI (role dropdown)

**Goal:** one invite form, with a role dropdown, used on both owner and custodian team pages.
The owner form offers **custodian + caretaker**; the custodian form offers **caretaker only**
(custodians may not add peers).

**Component design**
- Create `src/components/team/TeamInviteCard.tsx`
  - Props: `allowedRoles: ("custodian" | "caretaker")[]`, optional `systemAdmin`.
  - The role dropdown is populated from `allowedRoles`; hide it entirely when only one role is
    allowed.
  - Fields: **Role** dropdown, name, **email or phone** with country-code selector, optional
    owner id only for system-admin + custodian.
  - Validation: at least one contact; email valid when supplied; phone E.164 when supplied;
    system-admin owner id required when inviting a custodian.
  - Submit:
    - `role === "custodian"` → `POST /api/v1/custodians`.
    - `role === "caretaker"` → `POST /api/v1/caretakers`.
  - Success:
    - Email invite → toast “Invitation sent; they will receive an email.”
    - Phone-only → one-time credentials dialog with phone + temporary password.
  - Never display a temporary password returned for an email invite.
- Create `src/hooks/use-team-invites.tsx`
  - Reuse `useCustodianMutations.inviteCustodian`; add `inviteCaretaker` to
    `src/hooks/use-caretakers.tsx` (or expose a generic `inviteMember(role, input)`).
  - Track `pending`, error and the last `{ temporaryPassword }` response.
- Refactor `src/components/team/CustodianManager.tsx`
  - Move its invite button/dialog out into `TeamInviteCard` (keep the list/stats/revoke table).
  - Add a phone column/fallback for phone-only custodians.
- Update `src/components/team/CaretakerPrivilegesTable.tsx`
  - Show phone (or a fallback) when email is absent.
  - Keep privilege toggles unchanged.
- Update `src/hooks/use-caretakers.tsx`
  - `CaretakerRow.email?: string`, add `phone?: string`, add the invite mutation.

**Pages**
- `src/app/dashboard/owner/team/page.tsx`
  - `TeamInviteCard allowedRoles={["custodian","caretaker"]}` (default custodian).
  - Keep `CustodianManager` list (with the privileged toggle) + `CaretakerPrivilegesTable`
    (`canAssign` always true).
  - Subtitle: “Invite custodians and caretakers, assign privileges, and control what each team
    member can do.”
- `src/app/dashboard/custodian/team/page.tsx`
  - `TeamInviteCard allowedRoles={["caretaker"]}`.
  - Keep `CaretakerPrivilegesTable`; `canAssign` depends on the signed-in custodian's
    `assign_privileges` token.
  - Subtitle: “Invite caretakers and, if you are a privileged custodian, control what they can
    do across your owner's portfolio.”
- `src/app/dashboard/system-admin/caretakers/page.tsx`
  - Leave the existing privileges table in place. Reusing `TeamInviteCard` here is optional and
    out of scope unless a follow-up asks for it.

**Tasks**
- [x] T5.1 Create `TeamInviteCard` + hook, with component tests for role switching, contact
      validation, and phone-only credentials.
- [x] T5.2 Refactor `CustodianManager` to remove the duplicated invite dialog and add phone
      display; update its tests.
- [x] T5.3 Wire the card into the owner and custodian team pages.
- [x] T5.4 Update caretaker table/hook for optional email + phone.
- [ ] T5.5 Manual check: owner invites custodian by email and by phone; owner invites caretaker
      by email and by phone; custodian invites a caretaker; custodian cannot select custodian;
      owner grants a custodian the privileged toggle; that custodian can toggle caretaker
      privileges; a non-privileged custodian cannot; no custodian can edit/revoke a peer
      custodian or remove the owner.

---

### Phase 6 — Cleanup, docs, verification

- [x] T6.1 Update plan/status docs and any README notes about invite flows.
- [ ] T6.2 Run the identity migration/report script against a staging database and record
      duplicates before applying the unique phone index.
- [x] T6.3 Run the full verification suite:

```bash
npm run check
npm run typecheck
npm run test
```

- [ ] T6.4 Manual end-to-end pass:
  - Tenant with email only → invite email → verify → dashboard.
  - Tenant with phone only → credentials shown once → sign in with phone + password → dashboard.
  - Tenant with both → email invite, phone attached, phone sign-in also works after linking.
  - Owner team → invite custodian (email + phone paths).
  - Owner team → invite caretaker (email + phone paths).
  - Custodian team → invite caretaker (email + phone paths).
  - Owner marks a custodian privileged → that custodian can assign caretaker privileges.
  - Non-privileged custodian sees caretaker privileges read-only; no custodian can invite or
    revoke a peer custodian; no team endpoint can deactivate/delete the owner.
  - Sign in with `07…`, `254…`, and `+254…` all resolve to the same account.

## 5. Risks and tripwires

1. **Unique phone index migration.** Empty-string phones currently collide under a unique
   index. The migration must unset empty values and report duplicates before the index is
   created. Do not ship the index first.
2. **Tenant model change.** Existing `Tenant` rows all have email; making the field optional is
   additive. The partial unique index must exclude missing/empty email so two phone-only tenants
   on one property are allowed, while duplicate phones are not.
3. **Account hijacking by contact.** Never adopt an active user with a different role or a
   different owner binding. Pending invites may be refreshed only for the same role/owner.
4. **Caretaker magic-link bug.** The current caretaker route mints a token but does not send it.
   Fixing this is required for the email invite path to behave like custodians/tenants.
5. **Custodian scoping.** GET/POST must use the custodian's `managedByOwnerId`, not the
   custodian's own id, or the custodian team page remains empty and invitations bind to the
   wrong owner.
6. **Temporary password disclosure.** Return it only to the authenticated inviter, only on the
   phone-only creation response. Never include it in list/GET responses, logs, or email
   invitations.
7. **Forgot-password gap.** Phone-only users cannot use the email reset flow. They can change
   their password while signed in; SMS/OTP recovery is a follow-up.
8. **Existing tests.** `TenantsManager` tests assert email is required; caretaker tests assert
   `sendInviteEmail` is called without a token; custodian tests assert the existing response
   shape. Update them deliberately, not by weakening coverage.
9. **Blank-email rendering.** Team/tenant tables, search, and the profile card must tolerate a
   missing email instead of showing `undefined`.
10. **Privilege escalation.** The `assign_privileges` token is the only custodian-level
    privilege. It must not grant custodian or owner management. Enforce this in both the UI and
    the API; a UI-only hidden toggle is not sufficient.
11. **Owner protection.** Even though custodians share owner-equivalent portfolio powers, every
    team/user mutation must reject attempts to deactivate, delete, or reassign the owner. Add a
    guard and a regression test rather than relying on the absence of a route.

## 6. Non-goals

- SMS/WhatsApp delivery of invites or password-reset OTPs.
- Letting custodians invite, edit, or revoke other custodians (confirmed out of scope).
- Letting a privileged custodian promote another custodian to privileged, or otherwise manage a
  peer custodian (confirmed out of scope).
- Removing or deactivating the owner from any team surface.
- Changing the self-registration form to allow phone-only signup (this plan covers
  add/invite flows; self-signup can be a follow-up).
- Multi-role accounts or multiple users sharing one phone/email.
- Automatic merging of duplicate phone accounts discovered by the migration.
