# Domain Cutover Runbook — Custodian Homes

**Owner:** user (DNS/Vercel/registrar access required — `keja-yangu` is not under the CLI-authenticated Vercel account).
**Code state:** rebrand phases 0–3 merged to `dev` (`02585e7`); no code change is required for the cutover itself. This runbook covers only infra.

## 0. Pre-flight (code side, already green)

```bash
npx tsc --noEmit
npx biome check
npx vitest run          # 233 files / 2048 tests
npx next build          # must succeed; sitemap.xml must render
```

Confirm `dev` is pushed and the deployment you intend to promote is built from it.

## 1. Mailboxes (do this first — the sender address must exist before it is used)

Create on your mail provider (Google Workspace / Zoho / Resend / SES):

| Address | Purpose | Notes |
|---|---|---|
| `info@custodianhomes.co.ke` | public contact | forward to you |
| `support@custodianhomes.co.ke` | support (shown in app + email footer) | forward to support desk |
| `no-reply@custodianhomes.co.ke` | transactional sender | **do not monitor** |

**SMTP trap:** `EMAIL_HOST` defaults to `smtp.gmail.com`. Sending *as* `@custodianhomes.co.ke` through a Gmail account only works if that address is a verified alias on the authenticated account; otherwise Gmail rewrites or rejects the sender. If you are staying on Gmail SMTP, add `no-reply@custodianhomes.co.ke` as an alias and verify it first. **Recommended:** move transactional mail to a provider that authenticates by domain (Resend / Postmark / SES) — the code only needs `EMAIL_HOST/PORT/USER/PASS` updated.

## 2. DNS records for `custodianhomes.co.ke`

At the registrar / DNS host:

### App (Vercel)
- `A` `@` → `76.76.21.21` (Vercel) **or** the value Vercel shows in the dashboard
- `CNAME` `www` → `cname.vercel-dns.com`

### Mail (provider-specific — copy the exact values they give you)
- `MX` records per provider (priority + host)
- `TXT` `@` — SPF: `v=spf1 include:<provider-spf> ~all`
- `TXT` — DKIM key (provider gives the selector/name)
- `TXT` `_dmarc` — `v=DMARC1; p=quarantine; rua=mailto:dmarc@custodianhomes.co.ke; pct=100`
- Optional: `MTA-STS` + `TLS-RPT` TXT records

### Old domain redirect
- Keep `keja-yangu.com` DNS pointed at Vercel (or your registrar's redirect) so the 301 in step 4 resolves.

## 3. Vercel environment variables (Production)

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://custodianhomes.co.ke` | **no trailing slash** — a trailing slash breaks CSRF (`checkSameOrigin`) and produces `https://host//auth/verify` links |
| `EMAIL_FROM` | `Custodian Homes <no-reply@custodianhomes.co.ke>` | overrides the code default; this is the one that actually governs production |
| `EMAIL_HOST` | provider SMTP host | |
| `EMAIL_PORT` | `587` (or `465`) | |
| `EMAIL_USER` | SMTP username | |
| `EMAIL_PASS` | SMTP password / app password | |
| `MONGODB_URI` | unchanged | DB name stays `keja-yangu` by decision |

Redeploy production after saving.

## 4. Vercel domain configuration

1. Project → Settings → Domains → add `custodianhomes.co.ke` and `www.custodianhomes.co.ke`.
2. Set `custodianhomes.co.ke` as the **primary** domain.
3. Enable Vercel's automatic `www` → apex redirect (or apex → www, consistently).
4. Add `keja-yangu.com` and `www.keja-yangu.com` to the **same** project and configure a **301 redirect** to `https://custodianhomes.co.ke/$path` (path-preserving). Keep for ≥ 6 months.

## 5. Verify email delivery *before* flipping `EMAIL_FROM`

With the new SMTP env loaded locally (update `.env.local`):

```bash
npx tsx scripts/test-email.ts you@example.com
```

Check the received message:
- `From:` is `Custodian Homes <no-reply@custodianhomes.co.ke>`
- subject + body say Custodian Homes
- verify link points at `https://custodianhomes.co.ke/auth/verify?token=...`
- `Authentication-Results` shows `spf=pass`, `dkim=pass`, `dmarc=pass`

Only after all four pass, set `EMAIL_FROM` in Vercel and redeploy. (Setting it first and failing verification breaks signup/reset mail.)

## 6. Smoke tests after cutover

- [ ] Sign up → verification email arrives from `no-reply@custodianhomes.co.ke` → link opens on the new domain → account activates
- [ ] Forgot password → reset link works and lands on new domain
- [ ] Tenant pays an invoice → Paystack callback URL on new domain → payment recorded
- [ ] Dashboard mutations (create/update/delete) do not return 403 — confirms CSRF origin match
- [ ] `https://custodianhomes.co.ke/sitemap.xml` renders the new origin (not localhost)
- [ ] Home page source shows `og:site_name=Custodian Homes`, `og:url=https://custodianhomes.co.ke`, `twitter:creator=@custodianhomes`
- [ ] Old domain `keja-yangu.com` 301s to the new domain preserving path

## 7. Search Console / SEO

1. Verify ownership of `custodianhomes.co.ke` (DNS TXT or HTML file).
2. Submit `https://custodianhomes.co.ke/sitemap.xml`.
3. In the old property, use **Change of Address** → `custodianhomes.co.ke`.
4. Keep the 301s live for at least 6 months; monitor 404s in Search Console.

## 8. Rollback

Code is backward compatible: the session cookie (`keja-token`), localStorage keys (`keja-store:*`, `keja-return-to`), and the Mongo DB name are unchanged, so rollback is env-only.

1. Revert Vercel env (`NEXT_PUBLIC_APP_URL`, `EMAIL_FROM`, SMTP vars) to the old values.
2. Redeploy.
3. The 301s from `keja-yangu.com` remain additive — old-domain traffic still works.

## 9. Post-cutover cleanup (Phase 5 of the rebrand plan)

- README title + license line
- `package.json` `name`
- `docs/PROJECT_STRUCTURE.md`
- optional `KejaUser` → `AuthUser` rename
- rename `.opencode/skills/keja-yangu-conventions`

## Traps

- **`EMAIL_FROM` overrides the code default.** If it is still set to `Keja Yangu <no-reply@keja.co>` in Vercel, every real email keeps the old name/address while the body says Custodian Homes. Clear it or update it.
- **Trailing slash in `NEXT_PUBLIC_APP_URL`.** 403s every mutation and builds `//` links. The code now normalises via `getAppUrl()`, but keep the env value clean anyway.
- **`NEXT_PUBLIC_APP_URL` is inlined at build time.** Changing it requires a redeploy; a runtime-only change does nothing.
- **Do not rename the Mongo DB or the session cookie.** Both are deliberately untouched; renaming logs everyone out and breaks sessions.
- **`@keja.co` test fixtures** (`src/test/**`, `*.test.*`) are intentionally left alone — the brand guard skips them.
