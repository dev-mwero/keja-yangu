# Keja Yangu — Paystack Payments

## 1. Summary

Add Paystack as an online payment option for tenant invoices, sitting **alongside** the existing manual "mark paid" flows (both staff `mark-paid` and tenant self-certify stay). A tenant clicks **Pay online** on a pending invoice, is handed off to Paystack's hosted checkout (`authorization_url`), and a signed webhook auto-confirms the invoice. A new `Payment` ledger collection records provider attempts (1:N per invoice), the unique `providerReference` is the idempotency mutex, and a single atomic `applyProviderPayment` setter is shared by the webhook and the verify/callback path so staff-vs-webhook races resolve to exactly one settlement. Test-mode keys only via env; no live-merchant, no cron, no M-Pesa this round.

## 2. Scope

### In
- `Payment` model + `src/lib/payments/` (provider interface, Paystack adapter, settle logic, units).
- `POST /api/v1/tenant/me/invoices/[id]/pay-initiate` (tenant-only checkout initiation).
- `POST /api/v1/payments/paystack/webhook` (signature-authenticated, no cookie → no `checkSameOrigin`).
- `GET /api/v1/tenant/me/payments/status?reference=` (server-side verify fallback for lost webhook / callback return).
- Frontend: "Pay online" button on the tenant payments page + `URLSearchParams` callback handling in `use-my-invoices`.
- `canPayOnline` guard in `src/lib/invoicing.ts`, `mapChannelToMethod`, `PAYSTACK_*` env plumbing, README note.
- Hardening: make staff `mark-paid` and tenant self-mark-paid use the same conditional `{ status: pending, amountPaid: 0 }` findOneAndUpdate filter (race defense-in-depth).

### Out
- M-Pesa or any second provider.
- Cron/scheduled reconciliation.
- Partial/instalment payments (full-settlement only this round).
- Auto-payment, saved cards, subscriptions.
- Converting `amountDue`/`amountPaid` to integer minor units app-wide (flagged; display floats unchanged).
- Disabling the tenant self-mark-paid route.
- Live (sk_live) mode.
- Refund/credit handling (overpayments are held for staff review, recorded, not auto-applied).
- `docs/plans/` changes beyond this plan and README API table.

## 3. Architecture

```
Browse (tenant)                    Paystack
   │ POST pay-initiate                  │
   ▼                                    │
[pay-initiate route] ─ reference ───────┼──► POST /transaction/initialize
   │ (creates Payment row status=pending)│    ◄── authorization_url
   ▼                                    │
   window.location = authorization_url  │
   ────────────────────────────────────►│ (hosted checkout)
                                        │ webhook: charge.success (HMAC-SHA512)
   callback redirect ───────────────────┴──► POST /api/v1/payments/paystack/webhook
   ?reference=...  (GET status route)────────► verify via Paystack API
                                        │
                                        ▼
                        Payment row ──► Invoice.findOneAndUpdate(
                          (unique ref)    { _id, status: pending, amountPaid: 0 },
                                          $set status=paid, amountPaid=amountDue, …)
```

Two trust boundaries:
- **Paystack → webhook**: HMAC signature only. Never cookie auth, never `checkSameOrigin`.
- **Tenant browser → initiate/status**: JWT cookie + `checkSameOrigin` + tenant scoping via `resolveTenantIds`.

Key invariant kept: `status = paid ⇔ amountPaid = amountDue` (full settlement). `Payment` rows are the raw 1:N truth; `Invoice` stays the queryable aggregate the whole UI reads.

## 4. What to do

- **`src/lib/payments/provider.ts`**: `PAYMENT_PROVIDERS=["paystack"]`, `PAYMENT_STATUSES=["pending","success","failed","abandoned"]`, `PAYMENT_HOLD_MINUTES=90`, `MINOR_UNITS=100`, `toMinorUnits(major)=Math.round(major*100)` / `fromMinorUnits`. `PaymentProvider` interface: `createCheckout`, `verify`, `verifySignature`, `parseWebhook`. `mapChannelToMethod` (`card→"Card"`, `bank_transfer→"Bank"`, `mobile_money→"M-Pesa"`, `ussd→"Other"`, `qr→"Card"`, fallback `"Other"` — **do not add "Paystack" to `INVOICE_METHODS`**). `buildPaymentReference(invoiceId) = KY-<invoiceId>-<8 hex>`.
- **`src/models/Payment.ts`** (style of Lease/Invoice): fields `provider, providerReference (required), invoiceId, tenantId, ownerId, propertyId, amountMinor (int, min 0), currency (default "KES"), status, authorizationUrl?, channel?, paidAt?, initiatedAt (default now), expiresAt (required, initiatedAt+90min), lastEvent?, rawEvent? (Mixed, audit), notes[]`. Indexes: `{provider, providerReference}` unique; `{invoiceId, status}`; `{tenantId, createdAt:-1}`; `{ownerId, createdAt:-1}`; TTL `{expiresAt}` `expireAfterSeconds:0` with `partialFilterExpression:{status:"pending"}`.
- **`src/lib/payments/paystack.ts`**: `verifyPaystackSignature(rawBody, sig)` — `createHmac("sha512", secret).update(rawBody).digest()` vs `Buffer.from(sig,"hex")` via `timingSafeEqual` with a length guard first. Fail closed if `PAYSTACK_SECRET_KEY` missing (500 on webhook, 503 on initiate); assert not `sk_live_`. `createCheckout` = `POST https://api.paystack.co/transaction/initialize` with `Authorization: Bearer <secret>`, `{email, amount: amountMinor (string), currency:"KES", reference, callback_url, metadata:{custom_fields:[{variable_name:"invoice_id", value: invoiceId}]}}`, timeout ~10s, non-200/`status:false` → typed `PaymentProviderError`. `verify(reference)` = `GET /transaction/verify/:reference`.
- **`src/lib/payments/settle.ts`** — the single setter `applyProviderPayment({provider, providerReference, amountMinor, currency, channel?, paidAt?, source})` returning a discriminated outcome: `settled | already-settled | amount-mismatch | invoice-voided | invoice-missing | unknown-reference`. Resolve Payment by reference → Invoice by `payment.invoiceId` → replay fast-path (invoice already paid: catch-up flip the Payment row to success, return `already-settled`) → void check → **amount guard** (`data.amount === toMinorUnits(amountDue - amountPaid)`) → atomic flip:
  ```ts
  Invoice.findOneAndUpdate(
    { _id, status: { $in: ["pending","draft"] } },
    { $set: { status:"paid", amountPaid: invoice.amountDue, paidAt, method: mapChannelToMethod(channel), notes: `Paid via Paystack (${ref})`, paidBy: invoice.tenantId, paidByRole: "tenant" } },
    { new: true, runValidators: true }
  )
  ```
  Then flip Payment to success (never fail the request on this). On under/overpayment: record Payment success + push a mismatch note on Payment and Invoice, leave invoice pending, outcome `amount-mismatch`. **Always 200 to Paystack once signature is valid** (stops the up-to-72h retry storm).
- **`catch`**: webhook `POST /api/v1/payments/paystack/webhook/route.ts`:
  1. `const rawBody = await request.text()` — never `readJsonBody` (it swallows parse errors → would verify wrong bytes). Do not touch `request.json()`.
  2. Body length cap `>1_000_000` → 413 before verify (cheap).
  3. `verifyPaystackSignature(rawBody, header)` **before parsing, before DB**. Fail → 401.
  4. `JSON.parse(rawBody)`; if parse fails after a valid signature → log + 200 + review record (retries won't fix).
  5. zod envelope (`event`, `data.reference/status/amount/currency/channel/paid_at`); `z.coerce.number().int()` for amount. Non-`charge.success` → 200 `{received:true}` no-op.
  6. `charge.success` + `data.status==="success"` → `applyProviderPayment(...)` → 200 `{received:true}`.
  - No rate limit on the webhook (signature is the gate; an IP limiter here is spoofable and a DoS vector). Do not call `checkSameOrigin`; do not authenticate. Add code comments explaining the exclusions.
- **`pay-initiate` route**: `rateLimit` (user-keyed 5/min), `checkSameOrigin`, `isValidObjectId`→400, `requirePermission("invoice:read-own")`, `resolveTenantActor` + `resolveTenantIds`, `Invoice.findOne({_id, tenantId: {$in: tenantIds}})` → 404 on miss (existence not leaked). **Payable guard `canPayOnline`**: stored `status==="pending"` && `amountPaid===0` (deliberately narrower than `canMarkPaid` — drafts not payable online); else 409. Config guard → 503 if keys missing. One active non-expired pending Payment per invoice → return stored `authorizationUrl` (idempotent re-initiate; expire old → `abandoned`). Create the Payment row **before** calling Paystack (row is the claim); on E11000 return the existing row's URL. `callback_url = ${NEXT_PUBLIC_APP_URL}/dashboard/tenant/payments`. Response `{data:{paymentId, reference, authorizationUrl, expiresAt}}`. Amount always derived server-side; zod strips/ignores any client `amount`.
- **`GET .../tenant/me/payments/status`**: require `reference` (zod `^[A-Za-z0-9.\-=]+$`), scope `Payment.findOne({provider:"paystack", providerReference})` **and `payment.tenantId ∈ tenantIds`** else 404. Call `Provider.verify` only when `payment.status==="pending"`; feed into `applyProviderPayment`. Response `{data:{payment: serializePayment (rawEvent stripped), invoice: serializeInvoice(...)}}`.
- **Frontend** (`use-my-invoices.tsx` + `tenant/payments/page.tsx`): add `initiatePay(id)` → `window.location.assign(authorizationUrl)`; `checkPaymentReference(reference)`; on mount read `reference` from `URLSearchParams`, check, toast on settled, `history.replaceState` to strip params. Keep existing manual "Mark paid" as the secondary action. Add a "Pay online" primary button on payable rows.
- **Race hardening (small, in scope)**: change staff `mark-paid` and tenant `[id]` POST to the conditional `{_id, status: {$in:["pending","draft"]}}` (skip `amountPaid:0` there — full-settle routes already write `amountPaid=amountDue`; keep minimal) so they can never overwrite a webhook settlement. Update their tests.

## 5. What NOT to do

- **No `INVOICE_METHODS` "Paystack"** — provenance lives on the `Payment` row; adding the enum value ripples into dialogs and forms for zero benefit.
- **No client-side amount trust** — amount is always server-derived remaining balance; a client-sent `amount` is stripped/ignored (test it).
- **No Inline JS / `js.paystack.co`** — server redirect to `authorization_url` only. Avoids CSP changes (current `script-src` blocks it) and keeps the secret out of the client.
- **No Mongo `withTransaction`** — DB is a standalone (no replica set). Use the single conditional atomic update + unique index + catch-up.
- **No rate limit on the webhook route** — signature + unique index + conditional update are the protection.
- **Don't resolve the invoice from `data.metadata.invoice_id` or callback query params** — the initiation record (reference) is the only trusted map.
- **Don't log `x-paystack-signature`, raw payloads, or `customer.email`** — log `{event, reference, invoiceId, result, amountKobo}`.
- **Don't auto-settle over/under payments** — record + flag + leave `pending`; staff reconciles.
- **Don't set `runtime = "edge"`** on the webhook (crypto/Buffer/process.env need Node runtime).
- **No `readJsonBody` on the webhook** — it returns `{}` on parse failure.

## 6. Security considerations

- Signature verified over the exact raw bytes BEFORE any parsing or DB work; constant-time compare; length guard before `timingSafeEqual`.
- Fail closed: missing `PAYSTACK_SECRET_KEY` → 500 webhook / 503 initiate (no dev fallback secret on a payment webhook).
- Paystack webhook IPs (`52.31.139.75`, `52.49.173.169`, `52.214.14.220`) can change — prefer signature-only; infra allowlist optional, not in this round.
- Reference↔binding: webhook and verify resolve invoice via the initiate-created `Payment` row only.
- Tenant can only initiate/query their own invoices (404 on foreign, existence not leaked).
- Single active pending initiate per invoice (window 90 min).
- `PAYSTACK_SECRET_KEY` server-only (never `NEXT_PUBLIC_`); add to `.env.example`.

## 7. Performance considerations

- `limit(200)` bounds any reconciliation; amounts are integers after one `Math.round` conversion point.
- Webhook does ~2 lean Mongo ops — well under Paystack's 30s timeout. Optionally `export const maxDuration = 30`.
- Payment rows are indexed for status-check scans `{invoiceId, status}`.
- In-memory rate limiter is single-instance only (pre-existing limitation; acceptable now — restated).

## 8. DevOps and observability

- `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY` in `.env.local` / `.env.example`.
- Webhook URL must be registered on the Paystack dashboard under the matching test secret; local dev needs a tunnel.
- Log structured `[payments] event reference invoiceId result amountKobo` lines only.
- No CI/CD changes.

## 9. Implementation tasks

1. `src/lib/payments/provider.ts` (constants, interface, units, `mapChannelToMethod`, `buildPaymentReference`).
2. `src/models/Payment.ts` + model-mocks/factories stubs.
3. `src/lib/payments/paystack.ts` (signature, initialize, verify, parse; env guard).
4. `src/lib/payments/settle.ts` (`applyProviderPayment`).
5. `src/lib/invoicing.ts` `canPayOnline`; `src/lib/schemas/payments.ts` (envelope, query); export from `schemas/index.ts`.
6. Webhook route.
7. Pay-initiate route.
8. Payments status route.
9. Harden mark-paid routes (conditional update) + test updates.
10. `use-my-invoices.tsx` + tenant payments page.
11. `.env.example` + README API table note.

## 10. Testing strategy

- `lib/payments/paystack.test.ts`: known-vector HMAC-SHA512 pass; tampered body → false; wrong secret → false; bad/truncated hex → false; `mapChannelToMethod` table; `parseWebhook` happy/ignored/malformed; `toMinorUnits` precision (`0.29 → 29`, `2500.1 → 250010`).
- `lib/payments/settle.test.ts`: happy settle; replay → `already-settled`; crash catch-up; under/overpay → `amount-mismatch`, invoice untouched; void race; unknown reference; staff-vs-webhook race (Promise.all) → settled exactly once, single `paidAt`, `amountPaid===amountDue`.
- `pay-initiate/route.test.ts`: 401/403/404 (foreign invoice), 409 paid/void/draft, 503 missing keys, success persists row + returns URL, reuses unexpired pending, abandons expired, client `amount` ignored, user-keyed 429 at 6/min, no two actives.
- Webhook route test (`buildRequest` with signature computed via `createHmac`): 401 without/wrong sig; 400 malformed JSON; 200+settle valid `charge.success`; 200 ack on unrelated event; valid-sig unknown reference → 200 no mutation; replay twice → paid once.
- Status route test: arbitrary reference → 404; another tenant's reference → 404; failed/abandoned verify → not paid; amount mismatch → not paid.

## 11. Migration path

- Additive only: new `Payment` collection, new routes, new envs. No existing schema changes (Invoice untouched).
- Existing unpaid invoices immediately payable online; paid/void/draft unaffected.
- Rollback: remove the routes + revert frontend button; `Payment` rows orphaned harmlessly (TTL only clears pending; a couple of kept rows are inert history).

## 12. Rollout plan

- Ship behind test keys; exercise end-to-end in sandbox (initiate → sandbox card → webhook settle).
- Confirm webhook URL registered and reachable; verify callback + status fallback.
- On production switch: set matching live secret + register live webhook URL; no feature flag needed (env-gated).

## 13. Open questions

1. Currency confirmed KES in test mode — verify sandbox integration currency at first manual run.
2. Tenant email guarantee for `initialize`: `User.email` is required/verified; if ever empty use a placeholder (`tenant-<id>@keja.local`) — confirm acceptable.
3. `paidBy` becomes polymorphic (User id for manual, Tenant id for Paystack) — future consumers should treat as opaque; a `paidByKind` discriminator is deferred.
4. Overpayment policy (hold-for-review chosen) — refund/credit flow is a separate product decision.