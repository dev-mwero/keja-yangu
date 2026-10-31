/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { resolveServiceFee, resolveUnitServiceFee } from "@/lib/service-fees";

const unit = (overrides: Record<string, unknown> = {}) => ({
  _id: "unit-1",
  serviceCharge: 0,
  rentIncludesServiceCharge: false,
  rentSharePercent: 100,
  serviceChargeSharePercent: 0,
  ...overrides,
});

const item = (overrides: Record<string, unknown> = {}) => ({
  _id: "item-1",
  label: "Water",
  amount: 500,
  active: true,
  sortOrder: 0,
  appliesTo: "all" as const,
  unitIds: [],
  ...overrides,
});

describe("resolveServiceFee", () => {
  it("applies all-unit items and sums the breakdown", () => {
    const result = resolveServiceFee({
      unitId: "unit-1",
      items: [
        item({ _id: "water", label: "Water", amount: 500 }),
        item({ _id: "security", label: "Security", amount: 300 }),
      ],
      overrides: [],
    });
    expect(result.total).toBe(800);
    expect(result.breakdown).toEqual([
      { itemId: "security", label: "Security", amount: 300 },
      { itemId: "water", label: "Water", amount: 500 },
    ]);
  });

  it("applies selected items only to listed units", () => {
    const selected = item({
      _id: "water",
      appliesTo: "selected" as const,
      unitIds: ["unit-1"],
    });
    expect(resolveServiceFee({ unitId: "unit-1", items: [selected], overrides: [] }).total).toBe(
      500,
    );
    expect(resolveServiceFee({ unitId: "unit-2", items: [selected], overrides: [] }).total).toBe(
      0,
    );
  });

  it("applies an override amount and an override active flag", () => {
    const result = resolveServiceFee({
      unitId: "unit-1",
      items: [
        item({ _id: "water", label: "Water", amount: 500 }),
        item({ _id: "security", label: "Security", amount: 300 }),
      ],
      overrides: [
        { itemId: "water", unitId: "unit-1", amount: 700 },
        { itemId: "security", unitId: "unit-1", active: false },
      ],
    });
    expect(result.total).toBe(700);
    expect(result.breakdown).toEqual([{ itemId: "water", label: "Water", amount: 700 }]);
  });

  it("drops inactive, zero and negative items", () => {
    const result = resolveServiceFee({
      unitId: "unit-1",
      items: [
        item({ _id: "inactive", active: false }),
        item({ _id: "zero", amount: 0 }),
        item({ _id: "negative", amount: -10 }),
        item({ _id: "kept", amount: 200 }),
      ],
      overrides: [],
    });
    expect(result.breakdown).toEqual([{ itemId: "kept", label: "Water", amount: 200 }]);
  });

  it("sorts by sortOrder then label and rounds to whole KES", () => {
    const result = resolveServiceFee({
      unitId: "unit-1",
      items: [
        item({ _id: "b", label: "B", amount: 100.4, sortOrder: 2 }),
        item({ _id: "a", label: "A", amount: 200.6, sortOrder: 1 }),
        item({ _id: "c", label: "C", amount: 50, sortOrder: 1 }),
      ],
      overrides: [],
    });
    expect(result.breakdown.map((entry) => entry.itemId)).toEqual(["a", "c", "b"]);
    expect(result.total).toBe(351);
  });

  it("returns zero when no items apply", () => {
    expect(resolveServiceFee({ unitId: "unit-1", items: [], overrides: [] })).toEqual({
      total: 0,
      breakdown: [],
    });
  });
});

describe("resolveUnitServiceFee", () => {
  it("uses the legacy flat service charge when no item applies", () => {
    const result = resolveUnitServiceFee({
      unit: unit({ serviceCharge: 1200 }),
      unitId: "unit-1",
      items: [],
      overrides: [],
    });
    expect(result.total).toBe(1200);
    expect(result.breakdown).toEqual([
      { itemId: "legacy-service-charge", label: "Service charge", amount: 1200 },
    ]);
  });

  it("prefers itemized configuration over the legacy flat charge", () => {
    const result = resolveUnitServiceFee({
      unit: unit({ serviceCharge: 1200 }),
      unitId: "unit-1",
      items: [item({ amount: 500 })],
      overrides: [],
    });
    expect(result.total).toBe(500);
    expect(result.breakdown).toHaveLength(1);
  });

  it("does not restore the legacy charge when an applicable item is disabled", () => {
    const result = resolveUnitServiceFee({
      unit: unit({ serviceCharge: 1200 }),
      unitId: "unit-1",
      items: [item({ appliesTo: "selected", unitIds: ["unit-1"] })],
      overrides: [{ itemId: "item-1", unitId: "unit-1", active: false }],
    });
    expect(result.total).toBe(0);
    expect(result.breakdown).toEqual([]);
  });

  it("does not restore the legacy charge when an applicable item is zero", () => {
    const result = resolveUnitServiceFee({
      unit: unit({ serviceCharge: 1200 }),
      unitId: "unit-1",
      items: [item({ appliesTo: "selected", unitIds: ["unit-1"] })],
      overrides: [{ itemId: "item-1", unitId: "unit-1", amount: 0 }],
    });
    expect(result.total).toBe(0);
    expect(result.breakdown).toEqual([]);
  });

  it("preserves inclusive rent without adding an itemized fee", () => {
    const result = resolveUnitServiceFee({
      unit: unit({ rentIncludesServiceCharge: true, rentSharePercent: 80 }),
      unitId: "unit-1",
      items: [item({ amount: 500 })],
      overrides: [],
    });
    expect(result.rentIncludesServiceCharge).toBe(true);
    expect(result.total).toBe(0);
    expect(result.breakdown).toEqual([]);
  });
});
