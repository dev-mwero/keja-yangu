# Plan: Marketing Landing Page + Common Public Pages

**Status:** ✅ Delivered (`8c24b56`). Phase 1 (plan) + Phase 3 (build) complete.
**Branch:** `test/authz-status-semantics` → merged to `dev`.
**Owner:** Orchestrix (governor) + developer-prime/fast (build).

## 1. Objective

Replace the minimal home page (`src/app/page.tsx`) with a full marketing landing page and add the common public pages a SaaS/property platform needs: About, Pricing, Contact, FAQ, Terms, Privacy, and a polished 404. Evolve the existing brand (C badge, terracotta primary, Fraunces/Inter, shadcn + Tailwind). Improve hierarchy, spacing, motion. Responsive, accessible, SEO-friendly per page, secure contact endpoint.

## 2. Scope (in)

- Home landing page sections: Hero, stats band, Features (tenant/caretaker/owner), How-it-works, Property showcase, FAQ, Final CTA, Footer.
- New public routes: `/about`, `/pricing`, `/contact`, `/faq`, `/terms`, `/privacy`.
- Polished `/not-found` (404) and `/error`.
- `SiteFooter` reusable component; `MarketingShell` wrapper.
- Marketing section components under `src/components/marketing/`.
- Contact form (client) + `POST /api/v1/contact` + `sendContactMessage` in `src/lib/email.ts` + zod schema.
- `SiteHeader` public links updated.
- `sitemap.ts` updated with new routes.
- Per-page `metadata` using `BRAND_TITLE_TEMPLATE`.
- Unit + e2e tests.

## 3. Scope (out)

- No new design system; reuse existing tokens.
- No testimonials/social-proof logos (lean + FAQ chosen).
- No pricing teaser on home (dedicated /pricing page).
- Contact submissions are email-only (no DB persistence) — stateless, low-risk.
- No changes to dashboard, auth, or marketplace flows beyond nav links.

## 4. Tier 1 synthesis

### Code-analyst findings
- Public surface today: `/`, `/marketplace`, `/properties`, `/auth`, plus `/properties/[id]`. `proxy.ts` only guards `/dashboard/*` and `/api/*`, so new public routes are automatically public.
- Reusable: `SiteHeader`, `PropertyCard`, `Logo`, `Button`, `Input`, `Textarea`, `Select`, `Badge`, `Sheet`, `Dialog`, `Tabs`, `Slider`. `properties` static data + `useProperties` hook.
- Brand constants in `src/lib/brand.ts`; guard test scans `src/` for legacy literals.
- `not-found.tsx` and `error.tsx` exist but are minimal/unstyled.
- No footer component today (inline in page.tsx).
- No accordion component → use native `<details>`/`<summary>`.

### Performance-engineer findings
- Make home page a **server component** (currently `"use client"`). Only client islands: `SiteHeader` (already client), `PropertyCard` (already client), contact form.
- FAQ via native `<details>` = zero JS, accessible, SSR-friendly.
- Property showcase uses static `@/data/properties` (SSR, predictable LCP). Keep `next/image` with proper `sizes` and `priority` on hero.
- Hero image is 1600×1200; serve via next/image with `priority` + `fetchpriority="high"`.
- Respect `prefers-reduced-motion` for any motion.
- New public pages should be statically generated (default for server components with no dynamic data).

### DevOps-engineer findings
- No new env vars; contact uses existing SMTP.
- Security headers already configured in `next.config.ts` (CSP, HSTS, X-Frame-Options, etc.) — no change needed.
- Sitemap must list new routes; `robots.txt` unaffected.
- Contact API needs `checkSameOrigin` + `rateLimit` + zod (existing patterns).
- CI: add Playwright smoke spec for public nav; unit tests for components + schema.

### Test-engineer findings
- Unit: section presence, links, metadata exports, contact zod schema (valid/invalid, length caps, XSS payload handling).
- E2E: nav between public pages, mobile menu, FAQ toggle, contact submit (mocked email), 404 render.
- A11y: heading hierarchy, alt text, keyboard nav, focus, contrast, accordion semantics.
- Security: XSS payload in contact form, origin check, rate limit.
- Gates: `tsc --noEmit`, `biome check`, `vitest run`, `next build`, `playwright test`.

## 5. Tier 2 decision

No Tier 2 triggers met. Frontend-only, no new runtime dependency, no cross-system contract change, no schema/authz change. Security handled via established `checkSameOrigin`/`rateLimit`/zod/escape patterns; no new threat model required.

## 6. Design constraints

- Reuse Tailwind tokens (`container`, `font-display`, `gradient-warm`, `shadow-soft`, `shadow-elevated`) and shadcn components.
- Dark mode supported via existing ThemeProvider.
- Mobile-first; breakpoints sm/md/lg/xl/2xl.
- Respect `prefers-reduced-motion`.
- All user-facing strings via `BRAND` where they name the product; marketing copy can be literal but must pass the brand guard (no legacy literals).

## 7. Proposed file structure

```
src/components/
  SiteFooter.tsx
  MarketingShell.tsx
  marketing/
    Hero.tsx
    StatsBand.tsx
    Features.tsx
    HowItWorks.tsx
    PropertyShowcase.tsx
    Faq.tsx
    FinalCta.tsx
src/app/
  page.tsx                      (rewrite, server component)
  about/page.tsx
  pricing/page.tsx
  contact/page.tsx              (client form)
  faq/page.tsx
  terms/page.tsx
  privacy/page.tsx
  not-found.tsx                 (polish)
  api/v1/contact/route.ts
src/lib/schemas/contact.ts
src/lib/email.ts                (add sendContactMessage)
src/app/sitemap.ts              (add new routes)
```

## 8. Security (contact endpoint)

- Zod schema: `name` (1–80), `email` (valid), `subject` (1–120), `message` (10–2000). Trim + strip control chars.
- `checkSameOrigin` + `rateLimit` (5/min per IP).
- Escape HTML in email body (reuse `escapeHtml`).
- Send to `BRAND.emails.support`; reply-to set to submitter's email.
- No PII in logs beyond a truncated subject.
- CSP already blocks inline scripts; form posts to same origin only.

## 9. Build tasks (Phase 3)

- **T1 (prime):** SiteFooter, MarketingShell, marketing components, home page rewrite, SiteHeader nav update.
- **T2 (prime):** About, Pricing, FAQ, Terms, Privacy pages (static, server components) using MarketingShell.
- **T3 (prime):** Contact page (client form) + contact API route + zod schema + sendContactMessage.
- **T4 (fast):** Polish not-found.tsx + error.tsx; sitemap update.
- **T5 (fast):** Unit tests (components, schema, metadata) + e2e smoke spec.

T1 and T2/T3 are partially parallel; T4/T5 depend on routes existing. Run tsc/biome/vitest/build after.

## 10. Acceptance criteria

- Home page renders all 7 sections, LCP image prioritised, no CLS from fonts/images.
- All new routes return 200, have unique metadata (title template applied), appear in sitemap.
- Mobile (320px–768px) and desktop layouts both clean; mobile nav works.
- Contact form: valid submit sends email to support@; invalid input shows errors; XSS payload is escaped (not executed); rate limit returns 429 after 5/min; cross-origin returns 403.
- FAQ accordion keyboard-accessible (Enter/Space toggle, aria-expanded).
- `tsc --noEmit`, `biome check`, `vitest run`, `next build` all green; brand guard still passes (no legacy literals).
- Lighthouse: Performance ≥ 90, Accessibility ≥ 95, SEO ≥ 95 on home page.
