import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Unit } from "@/hooks/use-units";

const mocks = vi.hoisted(() => {
  const units: Array<Record<string, unknown>> = [];
  const properties: Array<Record<string, unknown>> = [];
  const unassignedTenants: Array<Record<string, unknown>> = [];
  const assignUnit = vi.fn();
  const vacateUnit = vi.fn();
  return {
    units,
    properties,
    unassignedTenants,
    assignUnit,
    vacateUnit,
    useUnits: () => ({ units, loading: false, error: null, refetch: vi.fn() }),
    useUnitMutations: () => ({
      updateUnit: vi.fn(),
      deleteUnit: vi.fn(),
      pending: false,
    }),
    useProperties: () => ({ properties, loading: false, error: null, refetch: vi.fn() }),
    usePropertyTenants: () => ({
      tenants: [],
      unassignedTenants,
      loading: false,
      error: null,
      refetch: vi.fn(),
    }),
    useTenantMutations: () => ({
      assignUnit,
      vacateUnit,
      pending: false,
    }),
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
vi.mock("@/hooks/use-tenants", () => ({
  usePropertyTenants: mocks.usePropertyTenants,
  useTenantMutations: mocks.useTenantMutations,
}));

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
    mocks.unassignedTenants.length = 0;
    mocks.assignUnit.mockReset();
    mocks.vacateUnit.mockReset();
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

describe("UnitsView assignment", () => {
  beforeEach(() => {
    mocks.units.length = 0;
    mocks.properties.length = 0;
    mocks.unassignedTenants.length = 0;
    mocks.assignUnit.mockReset();
    mocks.vacateUnit.mockReset();
    mocks.assignUnit.mockResolvedValue(undefined);
    mocks.vacateUnit.mockResolvedValue(undefined);
  });

  const seedUnits = () => {
    mocks.units.push(
      unitA as unknown as Record<string, unknown>,
      unitB as unknown as Record<string, unknown>,
    );
    mocks.properties.push({ _id: "prop-1", title: "Sunset Villa" });
    mocks.properties.push({ _id: "prop-2", title: "River Court" });
  };

  it("offers Assign for available units and Unassign for occupied units", async () => {
    seedUnits();

    render(<UnitsView nav={[]} roleName="Owner" />);

    expect(await screen.findByRole("button", { name: "Assign tenant to A1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unassign tenant from B2" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Unassign tenant from A1" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assign tenant to B2" })).not.toBeInTheDocument();
  });

  it("hides assignment actions when canManage is false", async () => {
    seedUnits();

    render(<UnitsView nav={[]} roleName="Custodian" canManage={false} />);

    expect(await screen.findByText("A1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assign tenant to A1" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Unassign tenant from B2" }),
    ).not.toBeInTheDocument();
  });

  it("assigns an unassigned tenant to an available unit", async () => {
    seedUnits();
    mocks.unassignedTenants.push({
      _id: "ten-9",
      name: "Mary Njeri",
      email: "mary@keja.co",
      propertyId: "prop-1",
      ownerId: "owner-1",
      status: "active",
    });

    const user = userEvent.setup();
    render(<UnitsView nav={[]} roleName="Owner" />);

    await user.click(await screen.findByRole("button", { name: "Assign tenant to A1" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /Mary Njeri/ }));
    await user.click(within(dialog).getByRole("button", { name: "Assign tenant" }));

    await waitFor(() => expect(mocks.assignUnit).toHaveBeenCalledWith("ten-9", "u1"));
    expect(await screen.findByRole("button", { name: "Assign tenant to A1" })).toBeInTheDocument();
  });

  it("unassigns the tenant from an occupied unit", async () => {
    seedUnits();

    const user = userEvent.setup();
    render(<UnitsView nav={[]} roleName="Owner" />);

    await user.click(await screen.findByRole("button", { name: "Unassign tenant from B2" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Unassign tenant" }));

    await waitFor(() => expect(mocks.vacateUnit).toHaveBeenCalledWith("ten-1"));
    expect(
      await screen.findByRole("button", { name: "Unassign tenant from B2" }),
    ).toBeInTheDocument();
  });
});
