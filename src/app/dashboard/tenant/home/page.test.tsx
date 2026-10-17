import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state: {
    tenancy: Record<string, unknown> | null;
    units: Array<Record<string, unknown>>;
  } = { tenancy: null, units: [] };
  return {
    state,
    useMyTenancy: () => ({ tenancy: state.tenancy, loading: false, error: null, refetch: vi.fn() }),
    useUnits: () => ({
      units: state.units,
      loading: false,
      error: null,
      total: state.units.length,
      refetch: vi.fn(),
    }),
  };
});

vi.mock("@/components/DashboardShell", async () => {
  const { createElement } = await import("react");
  return {
    DashboardShell: (props: { children?: React.ReactNode }) =>
      createElement("div", null, props.children),
  };
});
vi.mock("@/components/tenant/TenantComplaintsPanel", async () => {
  const { createElement } = await import("react");
  return { TenantComplaintsPanel: () => createElement("div", null, "Complaints panel") };
});
vi.mock("@/hooks/use-my-tenancy", () => ({ useMyTenancy: mocks.useMyTenancy }));
vi.mock("@/hooks/use-units", () => ({ useUnits: mocks.useUnits }));

import TenantHomePage from "@/app/dashboard/tenant/home/page";

describe("tenant home page", () => {
  beforeEach(() => {
    mocks.state.tenancy = {
      _id: "tenancy-1",
      name: "Amina",
      email: "amina@keja.co",
      propertyId: "prop-1",
      ownerId: "owner-1",
      status: "active",
      userId: "user-1",
      joinedAt: "2026-01-05T00:00:00.000Z",
    };
    mocks.state.units = [
      {
        _id: "unit-1",
        name: "3A",
        status: "occupied",
        tenantId: "user-1",
        blockName: "B",
        floorLabel: "2nd floor",
        rent: 45000,
        beds: 2,
        baths: 1,
        area: 80,
        propertyId: "prop-1",
      },
    ];
  });

  it("shows the occupant's unit details and the complaints panel", () => {
    render(<TenantHomePage />);

    expect(screen.getByText("Unit 3A")).toBeInTheDocument();
    expect(screen.getByText("2nd floor")).toBeInTheDocument();
    expect(screen.getByText("2 / 1")).toBeInTheDocument();
    expect(screen.getByText("80 m²")).toBeInTheDocument();
    expect(screen.getByText(/45,000/)).toBeInTheDocument();
    expect(screen.getByText("Complaints panel")).toBeInTheDocument();
  });

  it("falls back to an empty state when the tenant has no occupied unit", () => {
    mocks.state.units = [];
    render(<TenantHomePage />);

    expect(screen.getByText("No unit yet")).toBeInTheDocument();
    expect(screen.queryByText("Unit 3A")).not.toBeInTheDocument();
  });
});
