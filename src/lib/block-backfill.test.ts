/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { planBlockBackfill } from "@/lib/block-backfill";

describe("planBlockBackfill", () => {
  it("plans backfill for embedded blocks and detects valid mappings", () => {
    const properties = [
      {
        _id: "prop1",
        title: "Alpha Heights",
        blocks: [
          { _id: "b1", name: "Block A", order: 0, rentOverride: 20000, purpose: "residential" },
          { _id: "b2", name: "Block B", order: 1, rentOverride: null, purpose: null },
        ],
      },
    ];

    const units = [
      { _id: "u1", propertyId: "prop1", blockId: "b1", name: "A1" },
      { _id: "u2", propertyId: "prop1", blockId: "b2", name: "B1" },
    ];

    const { blocks, mismatches } = planBlockBackfill(properties, units);

    expect(mismatches).toHaveLength(0);
    expect(blocks).toEqual([
      {
        propertyId: "prop1",
        name: "Block A",
        order: 0,
        rentOverride: 20000,
        purpose: "residential",
        legacyEmbeddedId: "b1",
      },
      {
        propertyId: "prop1",
        name: "Block B",
        order: 1,
        rentOverride: null,
        purpose: null,
        legacyEmbeddedId: "b2",
      },
    ]);
  });

  it("identifies orphan units referencing non-existent properties or blocks", () => {
    const properties = [
      {
        _id: "prop1",
        title: "Alpha Heights",
        blocks: [{ _id: "b1", name: "Block A" }],
      },
    ];

    const units = [
      { _id: "u1", propertyId: "prop1", blockId: "unknown-block", name: "X1" },
      { _id: "u2", propertyId: "missing-prop", blockId: "b1", name: "Y1" },
    ];

    const { mismatches } = planBlockBackfill(properties, units);

    expect(mismatches).toHaveLength(2);
    expect(mismatches[0].issue).toContain("does not match any embedded block");
    expect(mismatches[1].issue).toContain("does not exist or is deleted");
  });
});

