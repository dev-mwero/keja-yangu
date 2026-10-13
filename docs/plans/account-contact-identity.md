# Plan — Account contact details & identity fields

**Request:** user accounts need a **mobile number (with country code)**, a **WhatsApp number
(if different from mobile)**, and a **national ID number**.

> Workflow note: Tier 1 agents (`@code-analyst`, `@performance-engineer`, `@devops-engineer`,
> `@test-engineer`) and Tier 2 agents could not be dispatched — the subagent channel returns
> `Insufficient account funds`. Analysis and the two Tier 2 rulings below were produced inline
> against the repository. They are authoritative for this build.

## Phase 1 — synthesis

### Scope
- `User` model gains: mobile (country-coded), WhatsApp, national ID.
- Own-profile API (read + update).
- `GET /api/auth/me` returns the fields; `KejaUser` client type extended.
- Settings "Profile" card (tenant / owner / caretaker) becomes an editable contact + identity form.

### Surface map (from code analysis)
| Surface | File | Note |
|---|---|---|
| Model | `src/models/User.ts` | has `phone` (trim, default ""), indexed `{phone:1}` |
| Search | `src/app/api/v1/users/search/route.ts` | matches `phone` exactly; returns only name/email/role/flags |
| Signup adopt | `src/app/api/auth/route.ts` | sets `existing.phone` from `body.phone` |
| Session | `src/app/api/auth/me/route.ts` | returns id/email/name/role/privileges/managedByOwnerId |
| Client auth | `src/hooks/use-auth.tsx` | `KejaUser` type; no update method today |
| Settings UI | `src/app/dashboard/{tenant,owner,caretaker}/settings/page.tsx` | identical Profile block; name input is **not wired to save** |

### Risk flags
1. **PII — national ID** is sensitive personal data.
2. **Phone drift** — free-text numbers without normalization make search/notifications unreliable.
3. **Back-compat** — `phone` is already indexed and used by search + signup-adopt; renaming it is a
   cross-cutting change with no functional benefit.

### Contradictions
None (single inline analysis).

## Phase 2 — Tier 2 rulings (invoked inline)

### `@database-architect`
- **Keep the `phone` field name** as the canonical **mobile in E.164** (`+254712345678`). Avoid a
  rename: the field is indexed and referenced by search + signup-adopt. Document the intent instead.
- Add `whatsapp: String, trim, default ""` — E.164. **Empty means "same as mobile".**
- Add `nationalId: String, trim, uppercase, default ""`.
- **No index on `nationalId`** (no lookup requirement; indexing PII widens exposure). Keep `{phone:1}`.
- Migration is **additive with defaults** → no backfill; legacy `phone` values normalised on write.

### `@security-expert`
- National ID is returned **only to the authenticated subject** (`/api/auth/me`, `/api/v1/users/me`).
  It is **never** returned by `users/search` or any list endpoint, and is **not** embedded in the JWT.
- Validate + cap (`normalizeNationalId`, ≤ 32 chars, `[A-Z0-9]`) to prevent oversize/injection.
- Never log field values.
- **Follow-up (out of scope):** field-level encryption / KMS before storing at regulated scale.

## Design constraints
- Mobile stored as E.164; UI composes it from a **country dial-code select** + national number.
- WhatsApp empty ⇒ inherits mobile (single source of truth).
- Country list is a small curated set with **Kenya (+254) default**.
- Reuse `settings:read` / `settings:write` permissions (granted to all roles incl. caretaker) for the
  new profile endpoint.

## Delivery / ops
No infra, CI, or dependency changes.

## Test strategy
- Unit: `phone.ts` (E.164 compose/parse/validate), `profileUpdate` zod schema.
- Route: `/api/v1/users/me` — 401 unauth, 403 forbidden, 400 invalid, 200 read/update.
- Component: `AccountDetailsForm` — prefill, WhatsApp-same-as-mobile toggle, submit payload.

## Out of scope (proposed follow-ups)
- Capturing mobile + national ID **at signup** (fields are editable immediately after verification).
- Field-level encryption of `nationalId`.
- Backfilling/formatting legacy `phone` values.
