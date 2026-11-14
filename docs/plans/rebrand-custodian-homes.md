# Rebrand — Keja Yangu → Custodian Homes

Plan for renaming the product, its public surface, its dashboard copy, and its
transactional email identity from **Keja Yangu** to **Custodian Homes** on
`custodianhomes.co.ke`.

Ordering follows the request: **dashboards first**, then auth + email, then
public pages, then infrastructure. Phases 0–3 are pure code and can ship on the
current domain; Phase 4 is the domain cutover and is the only irreversible step.

## Status

| Phase | Area | Status | Blocking cutover? |
|---|---|---|---|
| 0 | Brand constants + regression guard | ✅ Done (`d316b84`) | No |
| 1 | Dashboards | ✅ Done (`e8dffd1`) | No |
| 2 | Auth screens + transactional email | Planned | No |
| 3 | Public pages + SEO/OG/manifest | Planned | No |
| 4 | Infrastructure, DNS, mailboxes | Planned | **Yes** |
| 5 | Docs, package, repo cleanup | Planned | No |

---

## 1. Naming decisions

| Item | Value |
|---|---|
| Display name | `Custodian Homes` |
| Short name / wordmark | `Custodian` (with `Homes` as a secondary word) |
| Domain | `custodianhomes.co.ke` |
| Canonical URL | `https://custodianhomes.co.ke` |
| General/contact email | `info@custodianhomes.co.ke` |
| Support email | `support@custodianhomes.co.ke` |
| Transactional sender | `no-reply@custodianhomes.co.ke` |
| Tagline (unchanged) | `Property Rentals & Tenant Management` |
| Social handle (assumed) | `@custodianhomes` |

### Decisions (resolved)

1. **Wordmark** — option (a): badge `C`, `Custodian Homes` on one line with
   `Homes` in a lighter weight (`font-normal opacity-60`). Implemented in
   `src/components/Logo.tsx`, which derives both strings from `BRAND.name`.
2. **Session cookie** — keep `keja-token`. Renaming would log out every active
   session; revisit later behind a dual-read if the name ever needs cleaning.
3. **Test fixture emails** — `@keja.co` fixtures stay; the guard skips
   `src/test/**` and `*.test.*`.

Still open: repo/package rename (`package.json` name and the GitHub slug change
the remote URL and the `github-sass:dev-mwero/keja-yangu` alias) — deferred to
Phase 5 and best done as its own PR.

---

## 2. Inventory — what exists today

### User-visible brand strings

| Surface | File | Occurrences |
|---|---|---|
| Root metadata (title template, OG, Twitter, authors) | `src/app/layout.tsx` | 11 |
| Logo (badge `K`, wordmark `Keja`) | `src/components/Logo.tsx` | 2 |
| Dashboard + public header logo | `DashboardShell.tsx`, `SiteHeader.tsx`, `MobileNav.tsx`, `AuthLayout.tsx` | via `Logo` |
| Home page hero + footer | `src/app/page.tsx:36,178` | 2 |
| Sign-in subtitle | `src/app/auth/page.tsx:140` | 1 |
| Auth layout copyright | `src/components/AuthLayout.tsx:63` | 1 |
| Admin settings — offers description | `src/app/dashboard/admin/settings/page.tsx:46` | 1 |
| Settings — email sender note | `src/app/dashboard/tenant/settings/page.tsx:135`, `.../custodian/settings/page.tsx:135` | 2 |
| Transactional email templates (header, footer, all copy, subjects) | `src/lib/email.ts` | 23 |
| Notification email subjects | `src/lib/notifications.ts:384,462,574,596,709` | 5 |
| Manifest | `public/manifest.json` | 2 |
| Sitemap fallback URL | `src/app/sitemap.ts:3` | 1 |
| Sign-in account type (`KejaUser`) | `src/hooks/use-auth.tsx` | 5 (internal) |

### Addresses and domains

| Value | Where | Action |
|---|---|---|
| `keja.support@d8tatechsolutions.com` | tenant + custodian settings | replace with `support@custodianhomes.co.ke` — this is a provider mailbox leaking into product copy, so it is a correctness fix, not just branding |
| `no-reply@keja.co` (code default) | `src/lib/email.ts:100` | `no-reply@custodianhomes.co.ke` |
| `EMAIL_FROM` (env override wins) | `.env.example:15`, README | update env + example |
| `https://keja-yangu.com` | `layout.tsx:22`, `sitemap.ts:3` | `https://custodianhomes.co.ke` |
| `@kejayangu` | `layout.tsx:41` | `@custodianhomes` (confirm handle) |
| `keja-yangu` DB name | `.env.example:1`, `scripts/*.ts` defaults | **leave** — see §6 |

### Deliberately unchanged

`keja-token` cookie, `keja-store:` storage keys (`src/lib/local-store.ts:14-15`),
`keja-return-to` (`DashboardShell.tsx:41`), `keja-dev-field-encryption-key`
(`src/lib/crypto.ts:41` — changing it makes existing encrypted fields
unreadable), and the production MongoDB database name.

---

## 3. Phase 0 — Brand constants + guard

**Goal:** one source of truth so the next rename is a one-file change.

- Add `src/lib/brand.ts`:

  ```ts
  export const BRAND = {
    name: "Custodian Homes",
    shortName: "Custodian",
    domain: "custodianhomes.co.ke",
    url: "https://custodianhomes.co.ke",
    tagline: "Property Rentals & Tenant Management",
    emails: {
      info: "info@custodianhomes.co.ke",
      support: "support@custodianhomes.co.ke",
      noReply: "no-reply@custodianhomes.co.ke",
    },
  } as const;
  ```

- Add a regression test (`src/lib/brand.test.ts`) that walks `src/**` and fails
  on legacy brand literals: `Keja`, `keja-yangu.com`, `d8tatechsolutions`.
  Allowlist: `src/test/**`, `*.test.*`, `src/lib/brand.ts`, and an explicit
  `PENDING_REBRAND` set of files still awaiting their phase (currently
  `app/layout.tsx`, `app/page.tsx`, `app/auth/page.tsx`, `app/sitemap.ts`,
  `components/AuthLayout.tsx`, `lib/email.ts`, `lib/notifications.ts`). The set
  must end up empty.
- No UI change in this phase; ships safely on the current domain.

**Verification:** `npx tsc --noEmit`, `npx biome check`, `npx vitest run`.

---

## 4. Phase 1 — Dashboards

The logo is shared with the public header, so this phase changes the brand mark
everywhere. That is intended — one mark, one commit.

| # | File | Change |
|---|---|---|
| 1 | `src/components/Logo.tsx` | Badge `K` → `C`; wordmark per decision 1a/1b/1c; keep `font-display` and sizing |
| 2 | `src/app/dashboard/admin/settings/page.tsx:46` | `Offers and product updates from Keja Yangu.` → `… from Custodian Homes.` (or `BRAND.name`) |
| 3 | `src/app/dashboard/tenant/settings/page.tsx:135` | `keja.support@d8tatechsolutions.com` → `support@custodianhomes.co.ke`; keep the spam-folder hint |
| 4 | `src/app/dashboard/custodian/settings/page.tsx:135` | same as above |
| 5 | `src/app/dashboard/caretaker/settings/page.tsx`, `.../admin/settings/page.tsx` | add the same sender note if absent (currently only tenant + custodian have it) |
| 6 | Settings support block | make the address a real `mailto:support@custodianhomes.co.ke` link (no `mailto:` exists anywhere today) |

Check dashboard page `<title>`s: they rely on the root `%s | Keja Yangu`
template, so Phase 3 completes them — no per-page edits needed.

**Verification:** `tsc`, `biome`, `vitest run src/components src/app/dashboard`.
Manual: dashboard sidebar/collapsed rail at 320px, 768px, 1280px — confirm the
longer wordmark does not wrap or clip.

---

## 5. Phase 2 — Auth screens + transactional email

Deliverability-critical: the sender domain must be verified in Phase 4 *before*
any production email goes out with the new `From`.

| # | File | Change |
|---|---|---|
| 1 | `src/components/AuthLayout.tsx:63` | `© {year} Keja` → `© {year} Custodian Homes` |
| 2 | `src/app/auth/page.tsx:140` | `Sign in to continue to Keja.` → `… to Custodian Homes.` |
| 3 | `src/lib/email.ts` | Replace 23 literals via `BRAND`: `<title>`, header `<h1>`, footer name, copyright, and every body sentence (`Welcome to…`, `…your Keja Yangu account`, invitation copy) plus all `subject:` strings |
| 4 | `src/lib/email.ts:100` | Default sender → `Custodian Homes <${BRAND.emails.noReply}>` (env still wins) |
| 5 | `src/lib/notifications.ts` | 5 `subjectPrefix` values → `… - Custodian Homes` |
| 6 | `src/lib/email.test.ts:60-62`, `src/lib/notifications.test.ts:602` | Update asserted subjects |

Email copy should read naturally, not mechanically swapped:
`Welcome to Custodian Homes!` is fine; `Reset your Custodian Homes password`
is fine; but `…added as a caretaker on Custodian Homes` reads better as
`…added as a caretaker at Custodian Homes` — do a copy pass, don't blind-replace.

**Verification:** `vitest run src/lib`, plus render one template to HTML locally
and eyeball header/footer. Confirm no template still says `Keja`.

---

## 6. Phase 3 — Public pages + SEO

| # | File | Change |
|---|---|---|
| 1 | `src/app/layout.tsx:8` | **Bug fix:** `metadataBase: new URL("http://localhost:3000")` → `new URL(process.env.NEXT_PUBLIC_APP_URL ?? BRAND.url)`. Today every production OG/canonical URL resolves against localhost |
| 2 | `src/app/layout.tsx:10-11` | Default title + template → `Custodian Homes — Property Rentals & Tenant Management` / `%s \| Custodian Homes` |
| 3 | `src/app/layout.tsx:16-18` | `authors` / `creator` / `publisher` → `BRAND.name` |
| 4 | `src/app/layout.tsx:22-32` | `openGraph.url` → `BRAND.url`; `siteName`; title; image `alt` |
| 5 | `src/app/layout.tsx:38-41` | Twitter title + `creator` → `@custodianhomes` (confirm) |
| 6 | `src/app/page.tsx:36` | `Keja brings tenants…` → `Custodian Homes brings tenants…` |
| 7 | `src/app/page.tsx:178` | `© {year} Keja.` → `© {year} Custodian Homes.` |
| 8 | `src/app/sitemap.ts:3` | Fallback → `BRAND.url` |
| 9 | `public/manifest.json` | `name: "Custodian Homes"`, `short_name: "Custodian"` (JSON cannot import `brand.ts`; keep literals in sync manually and assert them in `brand.test.ts`) |

`/marketplace` and `/properties` use `SiteHeader` → `Logo`, so they follow
Phase 1 automatically. No copy changes needed there today.

**Verification:** `next build`; inspect the rendered `<head>` for `og:site_name`,
`og:url`, `twitter:creator`, `<title>`; fetch `/manifest.json`; validate
`/sitemap.xml` URLs point at the new domain.

---

## 7. Phase 4 — Infrastructure and cutover (irreversible)

Order matters. Do not start sending from the new domain before step 3 completes.

1. **Mailboxes.** Create `info@` and `support@custodianhomes.co.ke`; route
   `no-reply@` to a monitored (or discard) mailbox.
2. **DNS for email.** Publish SPF, DKIM and DMARC for `custodianhomes.co.ke`.
3. **Email provider.** Add and verify the domain with the provider used by
   `src/lib/email.ts` (SMTP/Resend); keep the existing credentials.
4. **Env on Vercel.** Set, in Production *and* Preview:
   - `NEXT_PUBLIC_APP_URL=https://custodianhomes.co.ke`
   - `EMAIL_FROM=Custodian Homes <no-reply@custodianhomes.co.ke>`
   > `NEXT_PUBLIC_APP_URL` must equal the real origin or `checkSameOrigin`
   > rejects every mutation with 403 — this bit us before.
5. **Domain.** Add `custodianhomes.co.ke` to the Vercel project, set it as the
   primary domain, keep `keja-yangu.com` attached with a 301 redirect to the new
   origin (path-preserving).
6. **SEO handoff.** Resubmit `sitemap.xml`, add the new property in Search
   Console, keep the old domain redirecting for at least a year.
7. **Smoke test.** Sign in, invite a user, trigger a verification email, mark an
   invoice paid, check the sender address and link origins.

**Rollback:** revert the primary-domain switch (old domain still serves the same
deployment); redeploy the previous commit if the code itself regresses. Lower
DNS TTL to 300s a day before cutover.

---

## 8. Phase 5 — Docs and housekeeping

| # | File | Change |
|---|---|---|
| 1 | `package.json` `name` | `keja-yangu` → `custodian-homes` (lockfile metadata only) |
| 2 | `README.md` | Title, `EMAIL_FROM` examples, licence line |
| 3 | `.env.example` | `EMAIL_FROM`, comment on line 18; **leave** `MONGODB_URI` db name |
| 4 | `docs/PROJECT_STRUCTURE.md:1` | Title |
| 5 | `src/hooks/use-auth.tsx` `KejaUser` | → `AuthUser` (optional, internal only) |
| 6 | `.opencode/skills/keja-yangu-conventions/` | Rename skill id/dir to match the repo, or leave as historical |
| 7 | `docs/plans/**`, `.opencode/plans/**` | **Leave** — historical records, not live copy |
| 8 | `scripts/*.ts` local DB defaults | Leave, or align to `custodian-homes` for fresh clones only |

---

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Cookie rename | Every user logged out | Keep `keja-token` (decision 2) |
| `NEXT_PUBLIC_APP_URL` mismatch | All mutations 403 via `checkSameOrigin` | Set env in the same deploy as the domain switch; verify with one mutation |
| Sender domain unverified | Verification/reset/invite mail silently spam-foldered | Complete SPF/DKIM/DMARC + provider verification before Phase 2 ships to prod |
| Support address typo | Users email a dead inbox | Address is centralised in `BRAND.emails`; guard test asserts it |
| Longer wordmark | Nav layout breaks on mobile | Visual check at 320px in Phase 1 |
| Old domain keeps indexing | Split SEO, stale OG previews | 301 redirect + sitemap resubmit + Search Console |
| Partial rebrand in the wild | Screenshots/copy mismatch | Ship Phases 0–3 in one deploy (single branch, merged once) |

---

## 10. Delivery mechanics

- Branch: `chore/rebrand-custodian-homes` off `dev`.
- One commit per phase, Conventional Commits:
  - `feat(brand): add brand constants and legacy-name guard`
  - `refactor(ui): rebrand dashboard shell and settings to Custodian Homes`
  - `refactor(email): rebrand transactional email and auth screens`
  - `refactor(seo): rebrand public metadata, manifest and sitemap`
  - `chore(ops): cut over to custodianhomes.co.ke` (docs/env only — the env change itself happens in Vercel)
  - `docs: rebrand README and project structure`
- Verification gate before each merge: `npx tsc --noEmit`, `npx biome check`,
  `npx vitest run`; `next build` before Phase 4.
- Merge `--no-ff` into `dev`, push, then deploy.

---

## 11. Out of scope

- Renaming the MongoDB database or collections.
- Renaming the GitHub repo / remote alias (separate decision).
- Changing the `keja-dev-field-encryption-key` (data-loss risk).
- Sweeping `@keja.co` test fixtures.
- Redesigning the logo, palette, or typography beyond the name swap. If the
  brand deserves a visual pass, schedule it separately — this plan only swaps
  identity strings.
