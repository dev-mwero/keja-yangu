# Phase 3 — Billing Separation

**Status:** Plan Approved — Implementation Ready  
**Goal:** Decouple management from payee and invoice ownership.  
**Depends on:** Phase 2 complete (`feat/revamp`, commit `9067415`)

> [!IMPORTANT]
> Authorization boundary: local code and test work only. No production data migration or deployment.

---

## 1. Objectives & Exit Criteria

### Objectives
1. Introduce standalone `BillingAccount` and `UnitBillingAssignment` domain models.
2. Maintain `BillingAccount` as the single source of truth for invoice numbering (`invoiceCounters`, `invoicePrefix`), printed legal entity details, and payment config.
3. Keep `Unit.billingAccountId` denormalised pointer in sync with the active `UnitBillingAssignment`.
4. Update `Lease`, `Invoice`, `Payment`, `PaymentSplit`, `ServiceFeeItem`, `UnitServiceFeeOverride`, and `OwnerPaymentConfig` to reference `billingAccountId`.
5. Upgrade invoice numbering service to support `${prefix}-${YYYYMM}-${seq}` keyed by `BillingAccount` (with zero-padded sequence numbers and retry on duplicate numbers) while falling back cleanly to legacy `User.invoiceCounters` if no billing account is attached.
6. Provide dual M-Pesa callback routing: support both legacy `[ownerId]` paths and new `[billingAccountId]` paths.
7. Build dry-run and apply backfill script `scripts/backfill-billing-accounts.ts` (`src/lib/billing-backfill.ts`).

### Exit Criteria (from Approved Plan)
- [ ] Historical invoices, payments, and numbering stay untouched (checksum invariant).
- [ ] New invoices use the assigned billing account and account-specific prefix.
- [ ] M-Pesa callbacks resolve via both billing account and legacy owner fallback.
- [ ] Manual property-level invoices still work without required unit or lease.
- [ ] No missing billing assignment for live units, leases, and generated invoices.
- [ ] All unit, integration, and full test suites pass with zero type errors and clean linting.

---

## 2. Domain Models & Schema Additions

### 2.1 `BillingAccount` (`src/models/BillingAccount.ts`)
- `_id`: ObjectId
- `ownerAdminId`: string (principal admin managing billing)
- `legalEntityName`: string (name on generated invoices)
- `legalOwnerRef`: string (optional link to `PropertyOwnership`)
- `invoicePrefix`: string (alphanumeric, default `"INV"`)
- `invoiceCounters`: Map/Record of `period` (`YYYY-MM`) → integer
- `defaultCurrency`: string (default `"KES"`)
- `paymentConfigId`: string (optional)
- `status`: `"active" | "suspended" | "closed"` (default `"active"`)
- `legacyOwnerId`: string (historical migration trace)
- Timestamps & Soft delete support

### 2.2 `UnitBillingAssignment` (`src/models/UnitBillingAssignment.ts`)
- `unitId`: string (required)
- `billingAccountId`: string (required)
- `effectiveFrom`: Date (required, default `Date.now`)
- `effectiveTo`: Date | null (default `null`)
- `status`: `"active" | "scheduled" | "ended" | "disputed"` (default `"active"`)
- `assignedByUserId`: string (required)
- `reason`: string (default `""`)
- `legacyOwnerId`: string (default `""`)
- Indexes:
  - Unique `{ unitId: 1 }` where `{ status: "active" }`
  - `{ billingAccountId: 1, status: 1 }`

### 2.3 Additive Schema Updates
- `Lease`: add `billingAccountId: { type: String, default: "" }`
- `Invoice`: add:
  - `billingAccountId: { type: String, default: "" }`
  - `billingAdminId: { type: String, default: "" }`
  - `unitId: { type: String, default: "" }`
  - `billingSnapshot: { legalEntityName: String, invoicePrefix: String }`
  - Index `{ billingAccountId: 1, period: 1 }`
- `Payment`: add:
  - `billingAccountId: { type: String, default: "" }`
  - `unitId: { type: String, default: "" }`
  - Index `{ billingAccountId: 1, status: 1 }`
- `PaymentSplit`: add `billingAccountId: { type: String, default: "" }`
- `ServiceFeeItem`: add `billingAccountId: { type: String, default: "" }`
- `UnitServiceFeeOverride`: add `billingAccountId: { type: String, default: "" }`
- `OwnerPaymentConfig`: add `billingAccountId: { type: String, default: "" }` (indexed)

---

## 3. Services & Route Changes

### 3.1 Billing Account Service (`src/lib/billing-accounts.ts`)
- `getOrCreateBillingAccount(ownerAdminId, initialData)`
- `resolveBillingAccountForUnit(unitId)`
- `assignBillingAccountToUnit(unitId, billingAccountId, assignedByUserId, reason)`
- `nextBillingAccountInvoiceNumber(billingAccountId, period)`

### 3.2 Invoice Numbering Upgrade (`src/lib/invoice-numbering.ts`)
- Support passing optional `billingAccountId`.
- If `billingAccountId` provided: atomically increment `BillingAccount.invoiceCounters.<period>`, fetch prefix, and format `${prefix}-${period.replace("-", "")}-${seq}`.
- Fallback: increment `User.invoiceCounters.<period>` with legacy prefix `"INV"`.

### 3.3 Invoice Generation (`src/lib/invoice-generation.ts`)
- Resolve unit's active `billingAccountId` via lease / unit.
- Populate `billingAccountId`, `billingAdminId`, `unitId`, and `billingSnapshot` on created invoices.

### 3.4 Payment Settlement & Callback Adapter (`src/app/api/v1/payments/...`)
- In `applyProviderPayment`, propagate `billingAccountId` from invoice to payment record.
- In M-Pesa callback:
  - Add support for `billingAccountId` in callback route params.
  - If parameter is an `ownerId`, lookup `BillingAccount.findOne({ legacyOwnerId: id })` or active config.

### 3.5 Backfill & Migration Script (`scripts/backfill-billing-accounts.ts` & `src/lib/billing-backfill.ts`)
- Scan all legacy owners with properties, units, or invoices.
- Upsert `BillingAccount` per owner with unique prefix.
- Create `UnitBillingAssignment` for all live units and set `Unit.billingAccountId`.
- Backfill `billingAccountId` on active leases, invoices, and payments.
- Support `--apply` flag (dry-run by default).

---

## 4. Implementation Steps

1. **Step 1**: Create `BillingAccount` and `UnitBillingAssignment` models and unit tests.
2. **Step 2**: Add `billingAccountId` and billing fields to `Lease`, `Invoice`, `Payment`, `PaymentSplit`, `ServiceFeeItem`, `UnitServiceFeeOverride`, `OwnerPaymentConfig`.
3. **Step 3**: Implement `src/lib/billing-accounts.ts` and update `src/lib/invoice-numbering.ts`.
4. **Step 4**: Update `src/lib/invoice-generation.ts` and invoice routes to populate billing accounts.
5. **Step 5**: Update payment callback and settlement to support `billingAccountId`.
6. **Step 6**: Implement `src/lib/billing-backfill.ts` and `scripts/backfill-billing-accounts.ts`.
7. **Step 7**: Update model stubs and write comprehensive unit and integration tests.
8. **Step 8**: Verify with Biome, TypeScript typecheck, and full Vitest suite.
9. **Step 9**: Update documentation in `docs/plans/multi-admin-revamp-07-phased-implementation.md` and commit.

