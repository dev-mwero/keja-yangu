import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  PropertyStructurePreview,
  summarizeStructure,
} from "@/components/property/PropertyStructureEditor";
import type { BlockInputPayload } from "@/hooks/use-properties";

const block = (over: Partial<BlockInputPayload> = {}): BlockInputPayload => ({
  name: "Block A",
  rentOverride: null,
  floors: [{ level: 0, unitsPerFloor: 0 }],
  ...over,
});

describe("summarizeStructure", () => {
  it("counts blocks, floors and units", () => {
    const summary = summarizeStructure([
      block({
        floors: [
          { level: 0, unitsPerFloor: 2 },
          { level: 1, unitsPerFloor: 3 },
        ],
      }),
      block({ name: "Block B", floors: [{ level: 0, unitsPerFloor: 1 }] }),
    ]);

    expect(summary.blocks).toBe(2);
    expect(summary.floors).toBe(3);
    expect(summary.units).toBe(6);
  });

  it("counts a floor with zero units toward floors but not units", () => {
    const summary = summarizeStructure([
      block({
        floors: [
          { level: 0, unitsPerFloor: 0 },
          { level: 1, unitsPerFloor: 4 },
        ],
      }),
    ]);

    expect(summary.floors).toBe(2);
    expect(summary.units).toBe(4);
  });

  it("uses the property rent when no override is set", () => {
    const summary = summarizeStructure(
      [block({ floors: [{ level: 0, unitsPerFloor: 3 }] })],
      10000,
    );

    expect(summary.monthlyRent).toBe(30000);
    expect(summary.minRent).toBe(10000);
    expect(summary.maxRent).toBe(10000);
  });

  it("prefers the floor override, then the block override, then the property rent", () => {
    const summary = summarizeStructure(
      [
        block({
          rentOverride: 20000,
          floors: [
            { level: 0, unitsPerFloor: 1, rentOverride: 50000 },
            { level: 1, unitsPerFloor: 1 },
          ],
        }),
        block({ name: "Block B", floors: [{ level: 0, unitsPerFloor: 1 }] }),
      ],
      10000,
    );

    // floor override 50000 + block override 20000 + property 10000
    expect(summary.monthlyRent).toBe(80000);
    expect(summary.minRent).toBe(10000);
    expect(summary.maxRent).toBe(50000);
  });

  it("returns zero rent and range when there are no units", () => {
    const summary = summarizeStructure([block()], 15000);

    expect(summary.blocks).toBe(1);
    expect(summary.floors).toBe(1);
    expect(summary.units).toBe(0);
    expect(summary.monthlyRent).toBe(0);
    expect(summary.minRent).toBe(0);
    expect(summary.maxRent).toBe(0);
  });

  it("handles an empty structure", () => {
    expect(summarizeStructure([])).toEqual({
      blocks: 0,
      floors: 0,
      units: 0,
      monthlyRent: 0,
      minRent: 0,
      maxRent: 0,
    });
  });
});

describe("PropertyStructurePreview", () => {
  it("prompts to edit when there are no blocks", () => {
    render(<PropertyStructurePreview blocks={[]} />);
    expect(screen.getByText(/No blocks yet/)).toBeInTheDocument();
  });

  it("lists blocks, floors and generated unit names", () => {
    render(
      <PropertyStructurePreview
        blocks={[
          block({
            name: "Block A",
            rentOverride: 25000,
            floors: [{ level: 0, label: "Ground", unitsPerFloor: 2 }],
          }),
        ]}
      />,
    );

    expect(screen.getByText("Block A")).toBeInTheDocument();
    expect(screen.getByText(/Rent Ksh 25,000/)).toBeInTheDocument();
    expect(screen.getByText(/2 units · GA, GB/)).toBeInTheDocument();
  });
});
