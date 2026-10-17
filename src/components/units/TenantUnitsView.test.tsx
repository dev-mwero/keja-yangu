import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeUnit } from "@/test/utils/factories";

const PROP_ID = "prop-1";
const UNIT_ID = "unit-1";

const mocks = vi.hoisted(() => {
  const units: unknown[] = [];
  const moveRequests: Array<Record<string, unknown>> = [];
  const tenancy: { value: Record<string, unknown> | null } = { value: null };
  const create = vi.fn();
  return {
    units,
    moveRequests,
    tenancy,
    create,
    useMyTenancy: () => ({
      tenancy: tenancy.value,
      loading: false,
      error: null,
      refetch: vi.fn(),
    }),
    useUnits: () => ({ units, loading: false, error: null, refetch: vi.fn() }),
    useMoveRequests: () => ({
      moveRequests,
      loading: false,
      error: null,
      refetch: vi.fn(),
    }),
    useMoveRequestMutations: () => ({ create, decide: vi.fn(), pending: false }),
  };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/DashboardShell", async () => {
  const { createElement } = await import("react");
  return {
    DashboardShell: (props: { children?: React.ReactNode }) =>
      createElement("div", { "data-testid": "shell" }, props.children),
  };
});
vi.mock("@/hooks/use-my-tenancy", () => ({ useMyTenancy: mocks.useMyTenancy }));
vi.mock("@/hooks/use-units", () => ({ useUnits: mocks.useUnits }));
vi.mock("@/hooks/use-move-requests", () => ({
  useMoveRequests: mocks.useMoveRequests,
  useMoveRequestMutations: mocks.useMoveRequestMutations,
}));

import { TenantUnitsView } from "@/components/units/TenantUnitsView";

function withTenancy() {
  mocks.tenancy.value = {
    _id: "ten-1",
    propertyId: PROP_ID,
    ownerId: "owner-1",
    userId: "user-1",
    status: "active",
  };
}

describe("TenantUnitsView", () => {
  beforeEach(() => {
    mocks.units.length = 0;
    mocks.moveRequests.length = 0;
    mocks.create.mockReset();
    withTenancy();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  });

  it("offers a request action for each vacant unit", () => {
    mocks.units.push(makeUnit({ _id: UNIT_ID, name: "3A", blockName: "D" }));
    render(<TenantUnitsView />);

    expect(screen.getByText("3A")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /request this unit/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /track requests/i })).toBeInTheDocument();
  });

  it("submits a move-in request for the chosen unit", async () => {
    mocks.units.push(makeUnit({ _id: UNIT_ID, name: "3A", blockName: "D" }));
    mocks.create.mockResolvedValue({});
    render(<TenantUnitsView />);

    await userEvent.click(screen.getByRole("button", { name: /request this unit/i }));

    expect(mocks.create).toHaveBeenCalledWith({
      type: "move-in",
      propertyId: PROP_ID,
      unitId: UNIT_ID,
    });
  });

  it("marks a unit that is already under request and disables it", () => {
    mocks.units.push(makeUnit({ _id: UNIT_ID, name: "3A", blockName: "D" }));
    mocks.moveRequests.push({
      _id: "mr-1",
      type: "move-in",
      status: "pending",
      unitId: UNIT_ID,
    });
    render(<TenantUnitsView />);

    expect(screen.getByText("Requested")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /request this unit/i })).toBeDisabled();
  });

  it("prompts to apply when there is no tenancy on record", () => {
    mocks.tenancy.value = null;
    mocks.units.push(makeUnit({ _id: UNIT_ID, name: "3A", blockName: "D" }));
    render(<TenantUnitsView />);

    expect(screen.getByText("No tenancy on record")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse homes" })).toBeInTheDocument();
    expect(screen.queryByText("3A")).not.toBeInTheDocument();
  });

  it("explains an empty inventory", () => {
    render(<TenantUnitsView />);

    expect(screen.getByText("No vacant units right now")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /request this unit/i })).not.toBeInTheDocument();
  });
});
