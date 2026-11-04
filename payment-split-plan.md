# Plan: Unit Payment Splitting (Rent + Service Charge)

## Problem

Payments for a unit consist of **rent** (goes to the owner) and a **service charge** (used by the caretaker for water, garbage collection, minor repairs, etc.). Two billing modes must be supported per unit:

1. **Inclusive rent** — rent already includes the service charge. The tenant pays one amount and is "good to go." Managers then split the collected amount into *actual rent + service fee* by configured percentages.
2. **Separate rent + service charge** — rent and service charge are billed/paid as distinct amounts.

## Scope (MVP)

- Per-unit service-charge configuration stored on `Unit`.
- A `PaymentSplit` record showing how each settled payment divides between rent (owner) and service charge (caretaker).
- Pure split computation used at settlement time (best-effort; never blocks a settlement).
- Invoice breakdown fields (`rentAmount`, `serviceChargeAmount`, `rentIncludesServiceCharge`) populated at generation time when unit info is available.
- The existing `PATCH /api/v1/units/[id]` route gains the new configuration fields (no new route required).
- Tests for the pure split function, settlement integration, and invoice generation breakdown.

## Files

### Create
- `src/models/PaymentSplit.ts` — Mongoose model recording how a settled payment divides.
- `src/lib/payment-split.ts` — pure `computePaymentSplit(unit, amountMinor)`.
- `payment-split-plan.md` — this file.

### Modify
- `src/models/Unit.ts` — add `serviceCharge`, `rentIncludesServiceCharge`, `rentSharePercent`, `serviceChargeSharePercent` + validation (inclusive ⇒ shares sum to 100).
- `src/lib/schemas/unit.ts` — add the 4 fields to `unitUpdateInput` so `PATCH /api/v1/units/[id]` can configure them.
- `src/models/Invoice.ts` — add `rentAmount`, `serviceChargeAmount`, `rentIncludesServiceCharge`.
- `src/lib/invoice-generation.ts` — `buildInvoiceForLease`/`generateForPeriod` accept optional unit charge info and populate the breakdown + `amountDue`.
- `src/lib/payments/settle.ts` — after a successful settlement, compute and record a `PaymentSplit` (best-effort).
- `src/app/api/v1/invoices/generate/route.ts` — load units for the leases and pass the unit-charge map to the planner.
- `src/test/utils/factories.ts` — add new fields to `TestUnit`/`makeUnit`.
- `src/lib/payments/settle.test.ts` — add PaymentSplit settlement tests.
- `src/lib/payment-split.test.ts` — new pure-function tests.
- `src/lib/invoice-generation.test.ts` — add unit-charge breakdown tests.
- `src/app/api/v1/units/[id]/route.test.ts` — test updating service-charge config.

## Design details

### Unit config (`src/models/Unit.ts`)
```
serviceCharge: Number (min 0, default 0)        // major units (KES), like Unit.rent
rentIncludesServiceCharge: Boolean (default false)
rentSharePercent: Number (0..100, default 100)   // % of collected amount that is rent (→ owner)
serviceChargeSharePercent: Number (0..100, default 0)  // % that is service fee (→ caretaker)
```
Validation (schema `validate`): when `rentIncludesServiceCharge` is true, `rentSharePercent + serviceChargeSharePercent === 100`. When false, shares are not applicable (default 100/0).

### Split computation (`src/lib/payment-split.ts`)
```ts
computePaymentSplit({ rentIncludesServiceCharge, rentSharePercent, serviceChargeSharePercent }, amountMinor)
  -> { rentMinor, serviceChargeMinor }
```
- Not inclusive → `{ rentMinor: amountMinor, serviceChargeMinor: 0 }` (all rent → owner).
- Inclusive → `rentMinor = round(amountMinor * rentSharePercent / 100)`; `serviceChargeMinor = amountMinor - rentMinor` (the two always sum exactly to the paid total, avoiding rounding drift).
- All amounts in minor units to match `Payment.amountMinor`.

### PaymentSplit model (`src/models/PaymentSplit.ts`)
```
paymentId, invoiceId, unitId, propertyId, ownerId, period,
rentMinor, serviceChargeMinor (minor units), createdAt (timestamps)
```
Unique index on `paymentId`; index on `invoiceId`. One row per settled payment.

### Settlement integration (`src/lib/payments/settle.ts`)
In `applyProviderPayment`, once the invoice flips to `paid`, load the invoice's `unitId` → `Unit`, compute `computePaymentSplit(unit, amountPaidMinor)`, and `PaymentSplit.create(...)`. Best-effort: wrap in try/catch, log warnings, never throw and never change the returned outcome.

### Invoice generation (`src/lib/invoice-generation.ts`)
`buildInvoiceForLease(lease, period, now, unitCharge?)` where
`unitCharge = { rentAmount, serviceChargeAmount, rentIncludesServiceCharge } | null`:
- inclusive: `amountDue = rentAmount` (collected total); breakdown from `unitCharge`.
- separate: `amountDue = rentAmount + serviceChargeAmount`; breakdown from `unitCharge`.
- no unitCharge: `amountDue = rentAmount`; `rentAmount = rentAmount`; `serviceChargeAmount = 0`.
`generateForPeriod` gains optional `unitChargeByLeaseId: Map<string, UnitCharge>` (default empty map, so existing callers/tests are unchanged).

### Route wiring
`PATCH /api/v1/units/[id]`: accepts the 4 new fields via `unitUpdateInput` (owner/custodian `unit:manage`).
`POST /api/v1/invoices/generate`: fetch `Unit` docs for the leases' `unitId`s, build a `Map<unitId, UnitCharge>`, pass to `generateForPeriod`.

## Verification
- `npm test` (vitest) — all existing + new tests pass.
- `npm run lint` (biome) — clean.
- `npx tsc --noEmit` — typecheck clean.
- Manual reasoning: inclusive split percentages sum to the paid total; separate mode keeps service charge out of rent.
