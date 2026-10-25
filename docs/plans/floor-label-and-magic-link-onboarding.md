# Floor naming + magic-link onboarding — Implementation Plan

Status: **PROPOSED** · Risk: **medium** (auth cookie changes + one new
token-based invite path) · Depends on: nothing shipped beyond current `dev`.

**Request (verbatim scope):**
1. The floor field is currently called **"Level"** in the UI — rename it to
   **"Floor"** everywhere the user sees it. (Every property has ≥1 block, each
   block has ≥1 floor; the floor is what is today labelled "Level".)
2. Self-registration: after the user clicks the verification (magic) link, take
   them **straight to their dashboard** — not back to the login/registration
   form — so they can complete any missing details.
3. Invitation flow (a user added by another user — tenant added by an
   owner/caretaker, custodian invited by an owner/system-admin): the magic link
   should take them to the **dashboard profile form** to fill missing fields,
   and on save they land on the **dashboard**.
4. Resolve the **pending issues** left by previous plans.

Author: inline (agent tier unavailable) · Date: 2026-10-21

> Workflow note: the `@principal-architect` / Tier 2 review channel is still
> unfunded. The auth-cookie change in Phase 2 is the one item that would
> normally get a security ruling; the mitigations are stated inline and must be
> accepted before Task 2 is built.

---

## 1. Current state (verified against the repo)

### 1.1 "Level" is a UI-only label
- The user-visible label is a single `<Label>` in
  `src/components/property/PropertyStructureEditor.tsx:225` → `Level`.
- The underlying persisted field is `Property.blocks[].floors[].level` (a
  **number**, `src/lib/schemas/structure.ts`, `src/hooks/use-properties.tsx`).
  It is read for unit naming (`buildUnitNames(level, …)`) and for display
  fallbacks (`floorLabel || floorLevel`).
- "Floor" already appears correctly in the **units tables**
  (`UnitsView.tsx:238`, `PropertyUnitsTable.tsx:228`) and preview
  (`PropertyStructurePreviewLayout.tsx`, "Floors" stat). So this is a wording
  inconsistency isolated to the structure editor's `level` input, not a data
  rename.

### 1.2 Self-registration magic link
- `POST /api/auth {action:"signup"}` creates the user `isVerified:false`, mints a
  `verificationToken` (UUID, 24h) and emails
  `${NEXT_PUBLIC_APP_URL}/auth/verify?token=…` (`src/lib/email.ts:390`).
- `POST /api/auth {action:"verify-email"}` marks the user verified and **clears
  the token** — it does **not** issue a session (`src/app/api/auth/route.ts:229`).
- `src/app/auth/verify/page.tsx` then shows a success card with a **"Sign in"**
  button linking to `/auth` — the exact dead-end the request calls out. The user
  must retype email + password.

### 1.3 Invitation flow
- Invites create a **pre-created, inactive** account: `isActive:false`,
  `isVerified:false`, and a **random password** nobody knows
  (`custodians/route.ts:146`; tenants are created as `Tenant` rows and, when no
  verified `User` exists, an invite email is sent —
  `tenants/route.ts:230`).
- The invite email links to
  `/auth?invited=1&email=…&role=…` (`email.ts:446`) — i.e. it **re-opens the
  sign-up form** and forces the invitee to create a password. On successful
  signup the code path at `route.ts:143` "adopts" the pre-created account, but
  only for `caretaker`/`tenant` with `managedByOwnerId` set — **custodian
  invites never adopt** (`existing.role === "custodian"` is not in the adoptable
  list), so a custodian whose email already exists hits `409 Email already
  registered`.
- There is no token on invite emails at all, so the invite link is not a magic
  link — it is a form deep-link.

### 1.4 Where "missing fields" live
- Self-registrants submit name, email, password, phone, national ID at signup →
  **no missing fields**; they only need verification. (Confirmed by the user.)
- Invitees are the ones with gaps: their account may lack a usable **password**
  (custodians/tenants get a random one), and their **name/phone/national ID**
  are placeholder or empty (`custodians/route.ts:151` sets `name = email` when
  absent; `phone` defaults `""`).
- The editable profile surface already exists: `AccountDetailsForm`
  (`src/components/account/AccountDetailsForm.tsx`) → `PATCH /api/v1/users/me`
  (`profileUpdate` schema; name/phone/whatsapp/nationalId). It is rendered on
  every role's `settings` page. **It has no password field** — it links out to
  `/auth/forgot-password`.

### 1.5 Pending issues from previous plans (audited)
| Plan | Status | Residual |
|---|---|---|
| `simplify-user-flows/*` | shipped (Phase 6 `32bc470`) | `ChatThread.unitId` intentionally deferred — stays deferred; not in scope. |
| `blocks-floors-units-management.md` | Part A done | **Part B "client vacant-unit browse + prefer" is now obsolete**: `UnitPreference`, `unit:prefer`, `use-unit-preferences` and `PUT /units/[id]/prefer` were **retired in Phase 6**. The plan doc still says TODO — needs a status correction, not code. |
| `assign-unit-in-manage-structure.md` | shipped (`15649d2`) | none. |
| `property-hierarchy-roles-search.md` | **Proposed — pending Tier 2** | never built; the hierarchy + property types it describes already shipped piecemeal (property-types, block/floor structure). Needs status reconciliation only. |
| `soft-delete.md` | Stages 1–3 implemented | none outstanding. |
| `account-contact-identity.md` | built | 3 "out of scope" follow-ups: capturing contact at signup (already done), national-ID field encryption (now done — `encryptField` is used), legacy phone backfill (data task, not code). |

**Conclusion:** there is **no unbuilt code** hiding in the previous plans — the
only residuals are (a) obsolete Part B, (b) two doc status lines, (c) a
genuinely *new* need surfaced by this request: **invitees (custodians
especially) can't complete onboarding today**. That is Phase 3 below.

---

## 2. Target flows

```
SELF-REGISTER   signup → email → magic link
                → verify-email (marks verified + issues session)
                → redirect to /dashboard/<role>            ← no second sign-in

INVITE (tenant/caretaker/custodian)
                owner adds person → email with tokenised magic link
                → verify-email (marks verified, activates, issues session)
                → /dashboard/<role>/settings (profile form, incl. set password)
                → Save → /dashboard/<role>
```

---

## 3. Phase 1 — Rename the floor label (low risk, standalone)

**Goal:** the floor input reads "Floor", never "Level", everywhere the user can
see it. No schema/API change.

**Decision:** keep the persisted key `level` (a number). Renaming it would touch
`Property.blocks[].floors[]` in the DB, the structure zod schemas, the
reconciliation planner, every unit materialisation path and the API contract —
for zero user-visible benefit. **Only the label changes.** (Rejected Option B:
rename `level`→`floorNumber` end-to-end. Recorded as a deliberate non-goal.)

**Files:**
- Modify `src/components/property/PropertyStructureEditor.tsx` — `<Label>Level</Label>`
  (L225) → `Floor`; the `id`/`htmlFor` (`floor-level-*`) and the placeholder
  `Floor ${floor.level}` (L243) stay aligned.
- Modify `src/components/property/PropertyStructureEditor.test.tsx` — any
  assertion on the "Level" label.
- Doc comment in `PropertyStructureEditor.tsx` (L167–169) already says "floors";
  leave as-is.

**Tasks**
- [ ] T1.1 Grep for user-visible `Level` / `\blevel\b` in JSX text nodes
      (`grep -rn ">Level<\|Level</Label>\|\"Level\"" src`) and change each to
      `Floor`. Expected target: `PropertyStructureEditor.tsx` only. Do **not**
      touch identifiers (`floor.level`, `floorLevel`, `level:`).
- [ ] T1.2 Update `PropertyStructureEditor.test.tsx` (and any RTL queryUsing
      `getByLabelText("Level")`).
- [ ] T1.3 `npx vitest run src/components/property/PropertyStructureEditor.test.tsx`
      → PASS.
- [ ] T1.4 Commit: `fix(structure): label the floor field "Floor" not "Level"`.

**Review focus:** T1.1 must not rename the `level` data field; a careless
find/replace would break `buildUnitNames` and the structure reconciliation.

---

## 4. Phase 2 — Self-registration magic link lands on the dashboard

**Goal:** clicking the verification link verifies the email **and signs the user
in**, then redirects to their role dashboard.

### 4.1 Design
- `POST /api/auth {action:"verify-email"}` currently returns
  `{ message }`. It will additionally:
  - mint the **same JWT** as `signin` (`{ userId, email, role, name }`, 7d),
  - set the `keja-token` cookie with the **same flags** as `signin`
    (`httpOnly`, `sameSite:"lax"`, `secure` in prod, `path:"/"`,
    `maxAge: 7d`),
  - return `{ message, user: { email, name, role }, redirectTo }`.
- The route already binds tenant rows on verify (`route.ts:254`) — keep that.
- `verify/page.tsx` success state: instead of a "Sign in" link, show a
  "Continue to your dashboard" button **and** auto-redirect via
  `router.replace(redirectTo)` after a short beat (so the success card is
  visible). Use the role→route map already defined in
  `src/app/auth/page.tsx:42`; extract it to a shared module to avoid drift.

### 4.2 Security note (decision needed)
Issuing a session from a tokenised GET-triggered verify is equivalent in risk to
a normal magic-link login: the token is single-use (cleared on success), 24h
TTL, and delivered only to the account's email. Mitigations to keep:
- Token is consumed on first successful verify (already done — `verificationToken`
  is set to `undefined`).
- Do **not** return the JWT in the JSON body (cookie only) so it can't be lifted
  by script/bookmark.
- Keep the existing auth rate-limit bucket for `verify-email`.
- `secure` cookie in production (already the signin behaviour).
Recorded so Phase 2 can proceed without the unfunded Tier 2 ruling; if the
ruling later forbids cookie-on-verify, Phase 4 is the fallback.

**Files:**
- Modify `src/app/api/auth/route.ts` (`verify-email` branch; add a small
  `issueSession(user, response)` helper mirroring the signin block).
- Modify `src/app/auth/verify/page.tsx` (auto-redirect + button label).
- Create `src/lib/role-routes.ts` — `roleRoute` map extracted from
  `src/app/auth/page.tsx`; both import it.
- Modify `src/app/auth/page.tsx` to import the shared map.
- Test: `src/app/api/auth/route.test.ts` (verify-email sets cookie), plus a
  `verify/page.test.tsx` if none exists.

**Tasks**
- [ ] T2.1 Failing test: `verify-email` success response includes a
      `keja-token` `Set-Cookie` and a `redirectTo` equal to the role route.
- [ ] T2.2 Add `issueSession` helper; call it from both `signin` and
      `verify-email` (DRY the cookie block).
- [ ] T2.3 Extract `roleRoute` to `src/lib/role-routes.ts`; repoint the auth
      page.
- [ ] T2.4 Update `verify/page.tsx`: success → auto `router.replace(redirectTo)`
      with a visible "Go to dashboard" button.
- [ ] T2.5 Run route + page tests; then `npx vitest run`.
- [ ] T2.6 Commit: `feat(auth): sign users in from the verification link`.

---

## 5. Phase 3 — Invitation magic link → profile form → dashboard

**Goal:** a person added by another user gets a link that verifies their email,
activates the pre-created account, signs them in, and drops them on the
**profile form** to fill missing details (and set a password); saving lands them
on the dashboard.

### 5.1 The custodian adoption bug (must fix first)
`signup`'s adopt path (`route.ts:143–147`) only adopts
`caretaker`/`tenant` with `managedByOwnerId`. Custodian invites therefore can't
onboard at all. Phase 3 replaces "re-signup to adopt" with "token verify +
activate", so it fixes this by construction — but the adopt list is still worth
widening to `custodian` for safety if any invitee ever reaches the signup form.

### 5.2 Design
1. **Invite email carries a token.** Extend `sendInviteEmail` to accept a token
   and link to `/auth/verify?token=…&invited=1` (reuse the verify page — one
   onboarding entry point).
2. **Every invite creates/uses a `verificationToken`** (24h) and stores the
   intended `role` + binding on the pre-created user:
   - `custodians/route.ts`: when creating a NEW user, mint
     `verificationToken`/expiry and pass it to `sendInviteEmail`. When linking an
     existing user, do not re-invite.
   - `tenants/route.ts`: when `!existingUser`, there is no `User` yet — see
     open question below.
3. **verify-email activates invited accounts.** Currently `verify-email` does not
   set `isActive`. For a *pending invite* it must: `isVerified = true`,
   `isActive = true` (invites are created inactive), then issue the session
   (Phase 2 helper) and return `redirectTo = <role>/settings` when the profile is
   incomplete, else the dashboard.
4. **Profile completeness check.** Add a small helper
   `isProfileComplete(user)` → `name` (not equal to email) AND a valid E.164
   `phone` AND non-empty `nationalId`. Incomplete → `redirectTo` the role's
   `settings` page; complete → the role dashboard.
5. **Password for invitees.** Invitees got a random password. Add a **"Set
   password"** action to the profile form (or a first-run banner on settings)
   that calls `PATCH /api/v1/users/me` with a new `password` field — or a
   dedicated `POST /api/auth {action:"set-password"}` for authenticated users.
   On Save the form redirects to the dashboard (honouring a `?next=` param).
6. **Custodian territory (verified):** there is **no** `settings` page under
   `/dashboard/custodian/` (`accounting, applications, communications,
   move-requests, page.tsx, portfolio, team, tenants, units`). Phase 3 must add
   `src/app/dashboard/custodian/settings/page.tsx` reusing the shared profile
   section (the tenant/owner/caretaker settings pages are the template), or the
   invite redirect target won't exist for custodians.

**Open questions (answer before build):**
- **Q1 (tenants):** a tenant invite today exists only as a `Tenant` row + email;
  there is no `User` to attach a token to. Options: (a) create a pre-created
  inactive `User` (mirroring custodians) when the tenant has no account;
  (b) keep the tenant invite as a signup deep-link but make the signup adopt
  path land on the profile form. **Recommendation: (a)** — one mechanism.
- **Q2 (password):** set password inline on the profile form vs. a separate
  step before it. **Recommendation:** inline field on the same form, saved via
  the profile endpoint, since the user asked for "the dashboard profile form
  where they get to update the missing fields and once done, they're on the
  dashboard".

**Files (indicative):**
- Modify `src/lib/email.ts` (`sendInviteEmail(email, name, role, token?)`; link
  to `/auth/verify?token=…&invited=1`; remove the `/auth?invited=…` form deep-link).
- Modify `src/app/api/v1/custodians/route.ts` (mint token; activate on verify).
- Modify `src/app/api/v1/tenants/route.ts` (per Q1).
- Modify `src/app/api/auth/route.ts` (`verify-email` activates invited users,
  returns `redirectTo`).
- Possibly create `src/app/dashboard/custodian/settings/page.tsx`.
- Modify `src/components/account/AccountDetailsForm.tsx` (optional password
  field; optional `?next=` redirect).
- Modify `src/lib/schemas/index.ts` (`profileUpdate` gains optional `password`)
  or add `set-password` action.
- Tests: `custodians/route.test.ts` (invite mints token), `auth/route.test.ts`
  (verify activates + redirects to settings when incomplete),
  `AccountDetailsForm.test.tsx` (password field).

**Tasks**
- [ ] T3.1 Failing test: inviting a new custodian sets `verificationToken` and
      the invite email receives it.
- [ ] T3.2 Extend `sendInviteEmail`; update its test.
- [ ] T3.3 `verify-email` activates an inactive invited account and returns
      `redirectTo` = settings when `isProfileComplete` is false.
- [ ] T3.4 Add `isProfileComplete` helper + tests.
- [ ] T3.5 Profile form: missing-field highlighting + optional set-password;
      Save redirects to `?next` (default the role dashboard).
- [ ] T3.6 Custodian settings page (if absent).
- [ ] T3.7 Full suite + tsc + biome; commit
      `feat(auth): onboard invited users through the profile form`.

---

## 6. Phase 4 — Pending issues from previous plans (docs)

**Goal:** make the plan docs match reality; no code.

- [ ] T4.1 `blocks-floors-units-management.md`: mark **Part B (§4) as
      WITHDRAWN**, noting `UnitPreference` was retired in
      `simplify-user-flows` Phase 6 — the client browse/prefer flow is superseded
      by the prospect-picks-a-unit flow (Phase 1 of that programme).
- [ ] T4.2 `property-hierarchy-roles-search.md`: change status from
      "pending ratification" to **SUPERSEDED IN PART** — property types
      (`type: "apartment"`, already default in `src/models/Property.ts:33`),
      the block/floor/unit hierarchy (`Property.blocks[].floors[]` + `Unit`) all
      shipped separately. **Verified remaining gap:** amenities are a free-text
      `[String]` (`Property.ts:38`) with **no predefined pickable list** and
      there is **no dashboard search bar** (`dashboardNav`/`DashboardShell`
      contain no search). Record those two as the only live residuals.
- [ ] T4.3 `account-contact-identity.md` §"Out of scope": tick off the two now
      done (signup capture, national-ID encryption) and leave the phone-backfill
      note as a data task.
- [ ] T4.4 Commit: `docs(plans): reconcile pending items with shipped code`.

---

## 7. Risks & tripwires

1. **Auth cookie on verify (Phase 2/3)** — the one security-sensitive change.
   Mitigations in §4.2; flagged for the (unfunded) Tier 2 ruling. Fallback =
   Phase 4's "authenticated set-password" without cookie-on-verify.
2. **`verify-email` activating accounts** — must only flip `isActive` for a
   *pending invite* (`isActive:false` at creation), never resurrect a
   deliberately deactivated user. Guard on the invite marker, not on
   `!isVerified` alone.
3. **Custodian adopt list** — widening `signup`'s adoptable roles (`route.ts:147`)
   must keep the `managedByOwnerId` guard, or anyone could adopt an orphan
   account by signing up with its email.
4. **`roleRoute` duplication** — two copies today (`auth/page.tsx`); extract
   before adding a third consumer (verify page).
5. **Test tripwires** — `auth/route.test.ts` asserts verify-email's response
   shape; adding `user`/`redirectTo` + a cookie must update it. `TenantsManager`
   / structure editor label tests may assert "Level".

## 8. Verification (definition of done)

```bash
npm run check          # biome
npm run typecheck      # tsc --noEmit
npm run test           # vitest run
```

Plus a manual pass: sign up → click the emailed link → land on the dashboard;
invite a custodian → click the link → land on the profile form → Save → land on
the dashboard.

## 9. Non-goals

- Renaming the `level` data field or any DB/API contract (Phase 1 is a UI label
  only).
- `ChatThread.unitId` (still intentionally deferred from `simplify-user-flows`).
- SMS/WhatsApp delivery of magic links (email only).
- Auto-purge / retention for soft-deleted records (`soft-delete.md` decision
  stands: manual purge only).
