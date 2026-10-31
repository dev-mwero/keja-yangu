import { ServiceFeeItem } from "@/models/ServiceFeeItem";
import { Unit } from "@/models/Unit";
import { UnitServiceFeeOverride } from "@/models/UnitServiceFeeOverride";

export type ServiceFeeAppliesTo = "all" | "selected";

export interface ServiceFeeItemLike {
  _id: unknown;
  label: string;
  amount: number;
  active?: boolean | null;
  sortOrder?: number | null;
  appliesTo?: ServiceFeeAppliesTo | null;
  unitIds?: string[] | null;
}

export interface UnitServiceFeeOverrideLike {
  itemId: unknown;
  unitId: string;
  amount?: number | null;
  active?: boolean | null;
}

export interface ServiceFeeBreakdownItem {
  itemId: string;
  label: string;
  amount: number;
}

export interface ResolvedServiceFee {
  total: number;
  breakdown: ServiceFeeBreakdownItem[];
}

/** Unit-level billing configuration passed to invoice generation. */
export interface UnitServiceFee extends ResolvedServiceFee {
  rentIncludesServiceCharge: boolean;
  rentSharePercent: number;
  serviceChargeSharePercent: number;
}

export interface UnitLikeForServiceFee {
  _id: unknown;
  serviceCharge?: number | null;
  rentIncludesServiceCharge?: boolean | null;
  rentSharePercent?: number | null;
  serviceChargeSharePercent?: number | null;
}

const LEGACY_ITEM_ID = "legacy-service-charge";
const LEGACY_LABEL = "Service charge";

function wholeKes(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? NaN)) return 0;
  return Math.max(0, Math.round(value as number));
}

function itemAppliesToUnit(item: ServiceFeeItemLike, unitId: string): boolean {
  if (item.appliesTo === "selected") {
    return (item.unitIds ?? []).map(String).includes(unitId);
  }
  return true;
}

/**
 * Resolve a unit's itemized service fee from the property template and the
 * unit's overrides. Invalid or zero amounts are dropped so a configured item
 * can never make an invoice amount negative.
 */
export function resolveServiceFee(input: {
  unitId: string;
  items: ServiceFeeItemLike[];
  overrides: UnitServiceFeeOverrideLike[];
}): ResolvedServiceFee {
  const unitId = input.unitId;
  const overrideByItemId = new Map<string, UnitServiceFeeOverrideLike>();
  for (const override of input.overrides) {
    if (override.unitId === unitId) {
      overrideByItemId.set(String(override.itemId), override);
    }
  }

  const breakdown = input.items
    .filter((item) => item.active !== false)
    .filter((item) => itemAppliesToUnit(item, unitId))
    .map((item) => {
      const override = overrideByItemId.get(String(item._id));
      const active = override?.active ?? item.active ?? true;
      if (!active) return null;
      const amount = wholeKes(override?.amount ?? item.amount);
      if (amount <= 0) return null;
      return {
        itemId: String(item._id),
        label: item.label,
        amount,
        sortOrder: item.sortOrder ?? 0,
      };
    })
    .filter((item): item is ServiceFeeBreakdownItem & { sortOrder: number } => item !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map(({ itemId, label, amount }) => ({ itemId, label, amount }));

  return {
    total: breakdown.reduce((sum, item) => sum + item.amount, 0),
    breakdown,
  };
}

/**
 * Build the full charge used by invoicing. Legacy inclusive-rent units keep
 * their historical total split by the configured percentages; every other unit
 * is billed as rent + itemized service fee. When no item applies, the legacy
 * flat `Unit.serviceCharge` acts as a single implicit item until the migration
 * is complete.
 */
export function resolveUnitServiceFee(input: {
  unit: UnitLikeForServiceFee;
  unitId: string;
  items: ServiceFeeItemLike[];
  overrides: UnitServiceFeeOverrideLike[];
}): UnitServiceFee {
  const unit = input.unit;
  if (unit.rentIncludesServiceCharge) {
    return {
      total: 0,
      breakdown: [],
      rentIncludesServiceCharge: true,
      rentSharePercent: unit.rentSharePercent ?? 100,
      serviceChargeSharePercent: unit.serviceChargeSharePercent ?? 0,
    };
  }

  const resolved = resolveServiceFee(input);
  const hasApplicableItem = input.items.some((item) => itemAppliesToUnit(item, input.unitId));
  if (hasApplicableItem) {
    return {
      ...resolved,
      rentIncludesServiceCharge: false,
      rentSharePercent: 100,
      serviceChargeSharePercent: 0,
    };
  }

  const legacyAmount = wholeKes(unit.serviceCharge);
  if (legacyAmount > 0) {
    return {
      total: legacyAmount,
      breakdown: [{ itemId: LEGACY_ITEM_ID, label: LEGACY_LABEL, amount: legacyAmount }],
      rentIncludesServiceCharge: false,
      rentSharePercent: 100,
      serviceChargeSharePercent: 0,
    };
  }

  return {
    total: 0,
    breakdown: [],
    rentIncludesServiceCharge: false,
    rentSharePercent: 100,
    serviceChargeSharePercent: 0,
  };
}

function groupByProperty<T extends { propertyId: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = String(row.propertyId);
    const group = map.get(key);
    if (group) group.push(row);
    else map.set(key, [row]);
  }
  return map;
}

function groupOverridesByUnit(
  rows: UnitServiceFeeOverrideLike[],
): Map<string, UnitServiceFeeOverrideLike[]> {
  const map = new Map<string, UnitServiceFeeOverrideLike[]>();
  for (const row of rows) {
    const key = String(row.unitId);
    const group = map.get(key);
    if (group) group.push(row);
    else map.set(key, [row]);
  }
  return map;
}

/**
 * Batched loader for invoice generation. Returns one charge per unit id; units
 * that no longer exist are absent from the map.
 */
export async function loadServiceFeesForUnits(
  unitIds: string[],
): Promise<Map<string, UnitServiceFee>> {
  const uniqueUnitIds = [...new Set(unitIds.filter(Boolean))];
  if (uniqueUnitIds.length === 0) return new Map();

  const units = await Unit.find({ _id: { $in: uniqueUnitIds } })
    .select(
      "propertyId serviceCharge rentIncludesServiceCharge rentSharePercent serviceChargeSharePercent",
    )
    .lean();
  if (units.length === 0) return new Map();

  const propertyIds = [...new Set(units.map((unit) => String(unit.propertyId)))];
  const [items, overrides] = await Promise.all([
    ServiceFeeItem.find({ propertyId: { $in: propertyIds } })
      .sort({ sortOrder: 1, label: 1 })
      .lean(),
    UnitServiceFeeOverride.find({ unitId: { $in: uniqueUnitIds } }).lean(),
  ]);

  const itemsByProperty = groupByProperty(items as Array<ServiceFeeItemLike & { propertyId: string }>);
  const overridesByUnit = groupOverridesByUnit(overrides as UnitServiceFeeOverrideLike[]);
  const result = new Map<string, UnitServiceFee>();

  for (const unit of units) {
    const unitId = String(unit._id);
    const propertyId = String(unit.propertyId);
    result.set(
      unitId,
      resolveUnitServiceFee({
        unit,
        unitId,
        items: itemsByProperty.get(propertyId) ?? [],
        overrides: overridesByUnit.get(unitId) ?? [],
      }),
    );
  }

  return result;
}

/** Resolve one unit's current service fee, used by previews and manual invoices. */
export async function loadServiceFeeForUnit(unitId: string): Promise<UnitServiceFee | null> {
  const result = await loadServiceFeesForUnits([unitId]);
  return result.get(unitId) ?? null;
}

export { LEGACY_ITEM_ID, LEGACY_LABEL };
