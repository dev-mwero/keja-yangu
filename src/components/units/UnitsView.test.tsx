import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Unit } from "@/hooks/use-units";

const mocks = vi.hoisted(() => {
  const units: Array<Record<string, unknown>> = [];
  const properties: Array<Record<string, unknown>> = [];
  return {
    units,
    properties,
    useUnits: () => ({ units, loading: false, error: null, refetch: vi.fn() }),
    useUnitMutations: () => ({
      updateUnit: vi.fn(),
      deleteUnit: vi.fn(),
      pending: false,
    }),
    useProperties: () => ({ properties, loading: false, error: null, refetch: vi.fn() }),
  };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/DashboardShell", async () => {
  const { createElement } = await import("react");
  return {
    DashboardShell: (props: { children?: React.ReactNode }) =>
      createElement("div", { "data-testid": "shell" }, props.children),
  };
});
vi.mock("@/hooks/use-units", () => ({
  useUnits: mocks.useUnits,
  useUnitMutations: mocks.useUnitMutations,
}));
vi.mock("@/hooks/use-properties", () => ({ useProperties: mocks.useProperties }));

import { UnitsView } from "@/components/units/UnitsView";

const unitA = {
  _id: "u1",
  name: "A1",
  propertyId: "prop-1",
  blockName: "Block A",
  floorLabel: "Ground",
  floorLevel: 0,
  rent: 10000,
  status: "available",
  tenantId: "",
} as Unit;

const unitB = {
  _id: "u2",
  name: "B2",
  propertyId: "prop-2",
  blockName: "Block B",
  floorLabel: "2",
  floorLevel: 2,
  rent: 20000,
  status: "occupied",
  tenantId: "ten-1",
} as Unit;

describe("UnitsView search", () => {
  beforeEach(() => {
    mocks.units.length = 0;
    mocks.properties.length = 0;
  });

  it("filters units by the search box", async () => {
    mocks.units.push(
      unitA as unknown as Record<string, unknown>,
      unitB as unknown as Record<string, unknown>,
    );
    mocks.properties.push({ _id: "prop-1", title: "Sunset Villa" });
    mocks.properties.push({ _id: "prop-2", title: "River Court" });

    render(<UnitsView nav={[]} roleName="Owner" />);
    expect(screen.getByText("A1")).toBeInTheDocument();
    expect(screen.getByText("B2")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("Search units…"), "River");

    expect(screen.getByText("B2")).toBeInTheDocument();
    expect(screen.queryByText("A1")).not.toBeInTheDocument();
  });
});
