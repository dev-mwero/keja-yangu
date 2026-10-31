# Keja Yangu — Itemized service fees (rent + optional service fee)

**Status:** Proposed (not implemented)
**Related:** `payment-split-plan.md` (flat service-charge split shipped), `src/models/Unit.ts`, `src/models/Invoice.ts`, `src/lib/invoice-generation.ts`, `src/lib/payment-split.ts`

## 1. Goal

Bill each unit as **rent + an optional service fee**, where the service fee is a collection of manager-defined expense items such as water, cleanliness, security, garbage, etc.

- The **owner, custodian, or caretaker** defines the individual fee items.
- The service fee is the sum of the active items that apply to that unit.
- A unit with no applicable items has **no service fee** — the invoice is rent only.
- The **tenant sees only two lines**: Rent and Service fee (plus the total). The item breakdown is for managers.

**Decisions (confirmed):**

| Decision | Choice |
|---|---|
| Definition model | Property-level fee template + per-unit overrides |
| Billing mode | Always separate: `total = rent + sum(active service fee items)` |
| Service fee optional | Yes; no items → zero fee |
| Tenant presentation | Aggregate service fee only; staff can see item breakdown |
| Existing flat `Unit.serviceCharge` | Migrates to a single "Service charge" item |

## 2. Current state (as-is)

- `Unit` has `serviceCharge` (flat KES), `rentIncludesServiceCharge`, `rentSharePercent`, `serviceChargeSharePercent`.
- `invoice-generation.ts` supports both inclusive rent and separate billing via `UnitCharge`.
- `Invoice` already stores `rentAmount`, `serviceChargeAmount`, `rentIncludesServiceCharge`.
- `PaymentSplit` records the rent/service-charge split at settlement.
- `POST /api/v1/invoices/generate` resolves each lease's unit and passes a `UnitCharge`.
- There is **no UI** to configure service charges in `UnitsView` or `PropertyUnitsTable`, and no itemization.
- Tenants currently see only `amountDue`; the rent/service-fee breakdown is not rendered on the payments page or receipt.
- Settlement's `computePaymentSplit` treats non-inclusive payments as 100% rent, which is no longer correct once service fees are billed separately.

## 3. Target model

### 3.1 Property fee template — new `src/models/ServiceFeeItem.ts`

One document per reusable fee item defined on a property.

```ts
{
  ownerId: string;      // required, indexed for scope checks
  propertyId: string;   // required, indexed
  label: string;        // "Water", "Cleanliness", "Security", ...
  amount: number;       // default monthly amount in KES (major units), >= 0
  active: boolean;      // default true
  sortOrder: number;    // default 0, controls display order
  appliesTo: "all" | "selected"; // default "all"
  unitIds: string[];    // used when appliesTo = "selected"; empty with "all"
}
```

- `appliesTo: "all"` → item applies to every current/future unit in the property.
- `appliesTo: "selected"` + `unitIds` → item applies only to those units (also how a unit-only fee is modeled).
- Deleting an item is a hard delete or `active: false`; prefer `active: false` so historical invoice snapshots stay meaningful.
- Indexes: `{ propertyId: 1, active: 1, sortOrder: 1 }`, `{ ownerId: 1 }`, `{ unitIds: 1 }`.

### 3.2 Per-unit override — new `src/models/UnitServiceFeeOverride.ts`

```ts
{
  ownerId: string;
  propertyId: string;
  itemId: string;    // ServiceFeeItem._id
  unitId: string;
  amount?: number;   // overrides the template amount
  active?: boolean;  // overrides the template active flag
  createdAt/updatedAt
}
```

- Unique `{ itemId: 1, unitId: 1 }`.
- Index `{ unitId: 1 }` and `{ propertyId: 1, unitId: 1 }`.
- An override row is only needed when a unit deviates from the template.
- If an item is removed from a unit entirely, set `active: false` in the override (keeps audit) rather than deleting the item.

### 3.3 Resolution helper — `src/lib/service-fees.ts`

Pure function:

```ts
resolveServiceFee({
  unitId,
  items: ServiceFeeItemLike[],
  overrides: UnitServiceFeeOverrideLike[],
}): {
  total: number; // KES
  breakdown: Array<{ itemId: string; label: string; amount: number }>;
}
```

Rules:

1. Keep only items where `active` is true by default and the item applies to the unit:
   - `appliesTo === "all"`, or
   - `appliesTo === "selected" && unitIds.includes(unitId)`.
2. For each item, apply the matching override (`itemId + unitId`) if present:
   - `amount` replaces the item amount.
   - `active: false` removes it.
3. Drop zero/negative amounts.
4. Sort by `sortOrder`, then label.
5. `total` is the sum of the breakdown; `amount` must be rounded to whole KES to match existing rent amounts (decide at implementation; current invoices use whole numbers).

DB helpers:

- `loadServiceFeeForUnit(unitId)` — one unit, used by unit detail/invoice preview.
- `loadServiceFeesForUnits(unitIds)` — batched, used by invoice generation to avoid N+1 queries.
- `syncLegacyUnitServiceCharge(unitId)` — optional compatibility shim that writes the resolved total back to `Unit.serviceCharge` while old readers still exist.

### 3.4 Unit and Invoice changes

**Unit**

- Keep `serviceCharge` as a **cached/legacy aggregate** during the transition. It is no longer the source of truth.
- Deprecate (but do not immediately remove) `rentIncludesServiceCharge`, `rentSharePercent`, `serviceChargeSharePercent`.
- New invoices always use separate billing and set `rentIncludesServiceCharge: false`.

**Invoice**

Add a staff-only snapshot:

```ts
serviceFeeItems: Array<{ itemId: string; label: string; amount: number }>;
```

Keep:

- `rentAmount` = lease rent.
- `serviceChargeAmount` = sum of `serviceFeeItems`.
- `amountDue` = `rentAmount + serviceChargeAmount`.

Snapshot at generation time so later template edits do not change historical invoices.

**Serialization / tenant visibility**

- Extend `serializeInvoice(doc, now, options?)` in `src/lib/invoicing.ts`:
  - Default: **omit** `serviceFeeItems` (safe for tenant routes).
  - `{ includeServiceFeeItems: true }` for staff invoice list/detail routes.
- Tenant routes (`/api/v1/tenant/me/invoices*`) keep the default and therefore never receive item labels/amounts.
- Tenant `Invoice` type gains optional `rentAmount`/`serviceChargeAmount` but **not** `serviceFeeItems`.
- Staff `Invoice` type may add `serviceFeeItems`.

### 3.5 Billing and settlement

**Invoice generation** (`src/lib/invoice-generation.ts`):

- Replace the `UnitCharge` rent-includes logic with a `ServiceFee` input:

```ts
interface UnitServiceFee {
  total: number;
  breakdown: Array<{ itemId: string; label: string; amount: number }>;
}
```

- `buildInvoiceForLease(lease, period, now, serviceFee)`:
  - `rentAmount = lease.rentAmount`
  - `serviceChargeAmount = serviceFee?.total ?? 0`
  - `amountDue = rentAmount + serviceChargeAmount`
  - `rentIncludesServiceCharge = false`
  - `serviceFeeItems = serviceFee?.breakdown ?? []`
- No service fee → `amountDue = rentAmount`, fee is 0/omitted from the tenant view.
- `POST /api/v1/invoices/generate` batch-loads items and overrides for the leases' units and passes per-lease `UnitServiceFee`.
- Lease-based manual invoice creation (`POST /api/v1/invoices`) should use the same resolution so manual and generated invoices agree. Free-form manual invoices without a lease keep the entered `amountDue`.

**Payment split** (`src/lib/payment-split.ts` / `src/lib/payments/settle.ts`):

Current behavior is wrong for separate billing (non-inclusive = all rent). Change to split by the **invoice snapshot**:

- Full settlement: `rentMinor = round((amountDue - serviceChargeAmount) * 100)`, `serviceChargeMinor = round(serviceChargeAmount * 100)`.
- Partial settlement (if supported later): allocate pro-rata by `rentAmount : serviceChargeAmount`; remainder goes to rent so the parts always sum to the paid amount.
- Keep the current inclusive fallback only for historical invoices where `rentIncludesServiceCharge: true` and `serviceFeeItems` is empty.
- `PaymentSplit` shape stays the same; the service portion now represents the itemized total.

## 4. API

All manager routes use `requirePermission(request, "unit:manage", { resource: { ownerId } })`, which already permits owner, custodian, and privileged caretakers. No new role is introduced.

### Property fee template

- `GET /api/v1/properties/[id]/service-fees`
  - Returns template items and the unit overrides (or counts), sorted.
  - Manager-only for unpublished properties; published properties still require manager scope (tenants do not see item details).
- `POST /api/v1/properties/[id]/service-fees`
  - Create `{ label, amount, active?, sortOrder?, appliesTo?, unitIds? }`.
  - Validate: label trimmed 1–60 chars, amount non-negative, selected requires at least one valid unit id belonging to the property.
- `PATCH /api/v1/properties/[id]/service-fees/[itemId]`
  - Edit label/amount/active/sortOrder/appliesTo/unitIds.
  - Changing `appliesTo`/`unitIds` does not delete existing overrides; overrides continue to win for their unit.
- `DELETE /api/v1/properties/[id]/service-fees/[itemId]`
  - Soft-disable (`active: false`) by default. A hard delete is allowed only if no override or invoice references it; otherwise return `409`. (Keep `itemId` snapshotted on invoices anyway, so hard delete is safe for history if preferred.)
- `PUT /api/v1/properties/[id]/service-fees/overrides`
  - Bulk set overrides for one unit: `{ unitId, overrides: [{ itemId, amount?, active? }] }`.
  - Upsert by `{ itemId, unitId }`; `null` amount/active removes the override.

### Unit fee preview

- `GET /api/v1/units/[id]/service-fees`
  - Manager-only.
  - Returns the resolved breakdown + `total` for that unit.
  - Tenant-facing unit responses never include this.

### Validation schemas

New `src/lib/schemas/service-fee.ts`:

- `serviceFeeItemCreateInput`
- `serviceFeeItemUpdateInput`
- `unitServiceFeeOverrideInput`

Use `z.coerce.number().nonnegative()` for amounts, `z.enum(["all", "selected"])`, and ObjectId regex/`isValidObjectId` refinement for ids.

## 5. UI

### Manager configuration

Add a **Service fees** section to the property management surface (property structure page or a dedicated tab), visible to owner/custodian/caretaker with `unit:manage`.

- `src/components/service-fees/ServiceFeesManager.tsx`
  - Table of template items: label, default amount, applies to (all / selected units), active toggle, sort order, edit/delete.
  - "Add fee item" dialog using `react-hook-form` + zod resolver.
  - Selected-unit picker (searchable by unit name/block/floor).
  - Live preview: "This unit: KES 2,500/month" when a unit is selected.
- `src/components/service-fees/UnitServiceFeesDialog.tsx`
  - Opened from a unit row ("Service fees" action).
  - Shows resolved items with per-unit amount/active overrides.
  - Allows adding a unit-only item (creates a `ServiceFeeItem` with `appliesTo: "selected"` and that `unitId`).
- Update `UnitsView` and `PropertyUnitsTable` row actions with a "Service fees" entry and display the resolved total next to rent.

### Tenant invoice presentation

- `src/app/dashboard/tenant/payments/page.tsx`
  - Show a compact breakdown in the bill row or a details dialog:
    - Rent: `formatKES(invoice.rentAmount)`
    - Service fee: `formatKES(invoice.serviceChargeAmount)` — hide when 0
    - Total: `formatKES(invoice.amountDue)`
- `src/components/invoices/ReceiptDialog.tsx`
  - Same two-line breakdown above "Invoice amount"; no item labels.
- `src/components/invoices/InvoiceTable.tsx` (manager)
  - Can show rent and service fee sub-lines under the total.
- Staff invoice detail can render `serviceFeeItems` as an itemized table.

### Invoice form

- `InvoiceFormDialog` lease-based creation currently uses `lease.rentAmount`; ensure the service fee is added to the displayed/created amount so managers do not accidentally create a rent-only invoice.
- Free-form manual invoices remain free-form.

## 6. Migration and rollout

### Legacy flat service charge

1. Backfill script `scripts/migrate-service-fees.ts`:
   - For each property with units where `serviceCharge > 0`:
     - Create one template item labelled **"Service charge"** with `appliesTo: "selected"`.
     - Add the affected units to `unitIds`.
     - For units whose legacy amount differs from the item default, create `UnitServiceFeeOverride` rows with the legacy amount.
   - Idempotent: match by `{ propertyId, label: "Service charge" }` and skip already-migrated units.
2. Legacy `Unit.serviceCharge` remains a fallback while the migration/UI rolls out:
   - Resolution order: explicit itemized configuration if any item applies; otherwise `Unit.serviceCharge` as a single implicit item; otherwise 0.
   - Once the migration is complete and UI is live, remove the fallback in a follow-up.
3. Historical invoices are never rewritten. Their `rentAmount`/`serviceChargeAmount` stay as issued.

### Inclusive-rent units (legacy)

The confirmed direction is always-separate billing. However, automatically raising a tenant's total (or silently reducing agreed rent) is risky.

- Flag units with `rentIncludesServiceCharge: true` in the migration report.
- Do **not** auto-change active leases.
- Recommendation: convert inclusive units at lease renewal/rent review; until then, preserve the historical total with the existing inclusive split for those specific units.
- New units and newly configured units always use separate itemized billing.

**Open question for implementation:** confirm whether inclusive-rent data exists in production. If it does not, drop the compatibility branch entirely and remove the inclusive fields after migration.

## 7. Edge cases

- **No items / all inactive:** service fee 0 → rent-only invoice; tenant sees no service fee line.
- **Item added mid-period:** only affects invoices generated after the change (snapshot at generation).
- **Item changed after invoice issued:** historical invoice is unchanged because of the snapshot.
- **Unit-only fee:** modeled as `appliesTo: "selected"` with one unit, or a unit override.
- **Override to zero:** use `active: false` rather than amount 0 if the item should disappear from the breakdown.
- **Unit moved between properties:** service fee configuration is property-scoped; allocation should warn or require reconfiguration if the unit's property changes (not currently supported, but note it).
- **Rounding:** store whole KES to match `Unit.rent`/`Lease.rentAmount`. If minor-unit precision is ever needed, keep resolution in major units and convert once at invoice/settlement time.
- **Manual partial payments:** split pro-rata using the invoice snapshot; never split from current template values.
- **Tenant privacy:** item labels and amounts are never returned on tenant invoice endpoints.

## 8. Files

### Create

- `src/models/ServiceFeeItem.ts`
- `src/models/UnitServiceFeeOverride.ts`
- `src/lib/service-fees.ts` + `service-fees.test.ts`
- `src/lib/schemas/service-fee.ts`
- `src/app/api/v1/properties/[id]/service-fees/route.ts` + test
- `src/app/api/v1/properties/[id]/service-fees/[itemId]/route.ts` + test
- `src/app/api/v1/properties/[id]/service-fees/overrides/route.ts` + test
- `src/app/api/v1/units/[id]/service-fees/route.ts` + test
- `src/components/service-fees/ServiceFeesManager.tsx`
- `src/components/service-fees/UnitServiceFeesDialog.tsx`
- `scripts/migrate-service-fees.ts`

### Modify

- `src/models/Unit.ts` — mark legacy fields deprecated; keep `serviceCharge` cache
- `src/models/Invoice.ts` — add `serviceFeeItems` snapshot
- `src/lib/invoice-generation.ts` — separate billing + snapshot
- `src/lib/invoice-generation.test.ts` — new cases
- `src/lib/payment-split.ts` — split from invoice snapshot, keep legacy fallback
- `src/lib/payments/settle.ts` — pass invoice fields, not unit percentages
- `src/lib/invoicing.ts` — serialization option to hide `serviceFeeItems`
- `src/types/invoicing.ts` — add `rentAmount`/`serviceChargeAmount`; staff-only items
- `src/app/api/v1/invoices/generate/route.ts` — batch-load fee config
- `src/app/api/v1/invoices/route.ts` and `[id]/route.ts` — include items for staff
- `src/app/api/v1/tenant/me/invoices/route.ts` and `[id]/route.ts` — keep items hidden
- `src/app/dashboard/tenant/payments/page.tsx` — rent + service fee lines
- `src/components/invoices/ReceiptDialog.tsx` — rent + service fee lines
- `src/components/invoices/InvoiceTable.tsx` — manager breakdown sub-lines
- `src/components/invoices/InvoiceFormDialog.tsx` — lease-based amount includes fee
- `src/components/units/UnitsView.tsx`, `src/components/property/PropertyUnitsTable.tsx` — service-fee action/total
- `src/test/utils/factories.ts`, `src/test/utils/model-mocks.ts` — new models/fixtures

## 9. Tests

### Pure resolution

- All-units item applies; selected item only to listed units.
- Override amount replaces default; override `active: false` removes the item.
- No items → total 0.
- Sorting by `sortOrder` then label.
- Sum is exact and whole-KES.

### Invoice generation

- Rent only when no fee items.
- Rent + fee total and per-item snapshot.
- Fee snapshot is stable after template edits.
- Inclusive legacy fallback still works for flagged units (if retained).
- Manual lease invoice uses the same fee resolution.

### Serialization / privacy

- Tenant invoice list/detail includes `rentAmount`/`serviceChargeAmount` but **not** `serviceFeeItems`.
- Staff invoice list/detail includes `serviceFeeItems`.
- Receipt/payments UI shows only Rent, Service fee, Total.

### Settlement

- Full settlement records `PaymentSplit` with service portion equal to the invoice's `serviceChargeAmount`.
- Partial settlement split sums exactly to the paid amount.
- Legacy inclusive invoice still splits by the old percentages.

### API / RBAC

- Owner, custodian, and privileged caretaker can CRUD items/overrides for their scope.
- A foreign owner/custodian/caretaker is rejected.
- Tenants cannot read service-fee config or item breakdowns.
- Invalid amounts, empty labels, foreign unit ids, and duplicate overrides are rejected.

### Migration script

- Idempotent backfill from legacy `serviceCharge`.
- Units with differing legacy amounts get overrides.
- Re-running does not duplicate items.

## 10. Verification

```bash
npm run check
npm run typecheck
npm run test
```

Manual:

1. As owner/caretaker, define property fee items (Water 500, Cleanliness 300, Security 200).
2. Override Water to 700 for one unit and exclude Security for another.
3. Generate invoices; verify:
   - Unit A: rent + 1,200 service fee.
   - Unit B: rent + 700 service fee.
   - Unit C with no items: rent only.
4. Tenant payments page/receipt shows only Rent and Service fee (no item labels).
5. Staff invoice view shows the item breakdown.
6. Settle a payment and verify the `PaymentSplit` service portion matches the invoice service fee.

## 11. Open defaults (not blocking)

- Amounts are whole KES per monthly period, matching existing rent.
- Items are recurring monthly; one-off fees remain manual invoices for now.
- Service fee configuration is property-scoped; an owner-wide catalog/import can be added later.
- Tenant never sees item breakdown in MVP; staff always do.
