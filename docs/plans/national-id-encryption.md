# Plan — Field-level encryption for the national ID

**Request:** the national ID captured on accounts must be **encrypted at rest** rather than
stored as plaintext in MongoDB.

> Workflow note: Tier 1 agents (`@code-analyst`, `@performance-engineer`, `@devops-engineer`,
> `@test-engineer`) and Tier 2 agents could not be dispatched — the subagent channel returns
> `Insufficient account funds`. Analysis and the Tier 2 ruling below were produced inline
> against the repository. They are authoritative for this build.

## Phase 1 — synthesis

### Scope
- Introduce a small crypto module for PII field encryption.
- Encrypt `User.nationalId` on every write path; decrypt only for the authenticated subject.
- Backfill existing plaintext values.

### Surface map (from code analysis)
| Surface | File | Note |
|---|---|---|
| Model | `src/models/User.ts` | `nationalId` was `trim + uppercase`, default "" |
| Write — signup | `src/app/api/auth/route.ts` | sets on create + adopt (`save()`) |
| Write — profile | `src/app/api/v1/users/me/route.ts` | `updateOne({ $set })` |
| Read — profile | `src/app/api/v1/users/me/route.ts` | `serialize()` |
| Read — session | `src/app/api/auth/me/route.ts` | returns `nationalId` |

`nationalId` is **not indexed** and **not queried** (prior ruling: PII, subject-only exposure), so
non-deterministic encryption is viable.

### Risk flags
1. **Base64 vs `uppercase`** — Mongo's `uppercase: true` built-in setter would corrupt base64
   ciphertext, so it is removed and normalisation is done explicitly before encrypting.
2. **`.lean()` reads bypass schema getters** — decryption must be explicit at the read sites.
3. **Legacy rows** — plaintext values predate this change; they must keep working until backfilled.
4. **Key management** — a new production secret; losing it makes ciphertext unreadable.

### Contradictions
None (single inline analysis).

## Phase 2 — Tier 2 rulings (invoked inline)

### `@security-expert`
- **Algorithm:** AES-256-GCM (authenticated encryption) with a random 96-bit IV per value.
- **Format:** `enc:v1:<base64(iv || tag || ciphertext)>` — versioned so the scheme can change
  without a flag day; the prefix also lets reads detect ciphertext vs legacy plaintext.
- **Key:** `FIELD_ENCRYPTION_KEY` (32 bytes, base64 or 64-char hex). Required in production
  (fail-closed, mirroring `JWT_SECRET`); a deterministic dev/test fallback is used otherwise.
- **Exposure:** decrypt only at the two subject-facing read endpoints — never in search/lists and
  never in the JWT. This keeps the prior PII ruling intact.
- **Non-determinism:** acceptable because the field is never used in queries or equality checks.

### `@database-architect`
- No schema/index change is required (the field stays a `String`; it is not indexed).
- Migration is a one-off backfill (`scripts/encrypt-national-ids.ts`) that encrypts non-empty,
  non-prefixed values; it requires `FIELD_ENCRYPTION_KEY` and is idempotent.
- Drop `uppercase: true`; normalisation (`normalizeNationalId`) already runs at every write site.

## Phase 3 — build
- `src/lib/crypto.ts` (+ tests): `encryptField` / `decryptField` / `isEncrypted`.
- Encrypt on signup (create + adopt) and on profile update; decrypt in `GET /api/v1/users/me`
  and `GET /api/auth/me`.
- Backfill script + `.env.example` entry.
