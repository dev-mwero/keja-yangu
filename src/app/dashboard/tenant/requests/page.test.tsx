import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withdraw: vi.fn(),
  create: vi.fn(),
  applications: [] as Array<Record<string, unknown>>,
  moveRequests: [] as Array<Record<string, unknown>>,
  loading: false,
  tenancy: null as Record<string, unknown> | null,
  units: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/components/DashboardShell", async () => {
  const { createElement } = await import("react");
  return {
    DashboardShell: (props: { children?: React.ReactNode }) =>
      createElement("div", null, props.children),
  };
});
vi.mock("@/config/dashboardNav", () => ({ tenantNav: [] }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { email: "amina@keja.co" } }),
}));
vi.mock("@/hooks/use-applications", () => ({
  useTenantApplications: () => ({ applications: mocks.applications, refresh: vi.fn() }),
  useApplicationMutations: () => ({ withdraw: mocks.withdraw, pending: false }),
}));
vi.mock("@/hooks/use-move-requests", () => ({
  useMoveRequests: () => ({
    moveRequests: mocks.moveRequests,
    loading: mocks.loading,
    refetch: vi.fn(),
  }),
  useMoveRequestMutations: () => ({ create: mocks.create, pending: false }),
}));
vi.mock("@/hooks/use-my-tenancy", () => ({ useMyTenancy: () => ({ tenancy: mocks.tenancy }) }));
vi.mock("@/hooks/use-units", () => ({ useUnits: () => ({ units: mocks.units }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import TenantRequestsPage from "@/app/dashboard/tenant/requests/page";

const pendingApplication = {
  id: "app-1",
  propertyId: "prop-1",
  propertyTitle: "Sunrise Court",
  unitName: "3A",
  applicantName: "Amina Otieno",
  status: "pending",
  submittedAt: "2026-10-01T09:00:00.000Z",
};

const approvedMoveOut = {
  _id: "mr-1",
  type: "move-out",
  status: "approved",
  note: "Leaving in November",
  decisionNote: "Approved",
  requestedDate: "2026-10-05T09:00:00.000Z",
  unitName: "5B",
  blockName: "Block A",
};

const pendingMoveIn = {
  _id: "mr-2",
  type: "move-in",
  status: "pending",
  note: "",
  decisionNote: "",
  requestedDate: "2026-10-06T09:00:00.000Z",
  unitName: "7C",
  blockName: "Block B",
};

describe("tenant requests page", () => {
  beforeEach(() => {
    mocks.applications = [];
    mocks.moveRequests = [];
    mocks.tenancy = null;
    mocks.units = [];
    mocks.withdraw.mockReset();
    mocks.create.mockReset();
  });

  it("lists applications and move requests in one table", async () => {
    mocks.applications = [pendingApplication];
    mocks.moveRequests = [pendingMoveIn];

    render(<TenantRequestsPage />);

    expect(screen.getByText("Sunrise Court")).toBeInTheDocument();
    expect(screen.getByText(/7C/)).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Applications" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Move requests" })).toBeNull();
    expect(document.querySelectorAll("table")).toHaveLength(1);
  });

  it("offers withdraw for a pending application", async () => {
    mocks.applications = [pendingApplication];
    render(<TenantRequestsPage />);

    await userEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    expect(mocks.withdraw).toHaveBeenCalledWith("app-1");
  });

  it("shows the request action cards", () => {
    mocks.tenancy = { propertyId: "prop-1", userId: "user-1" };
    mocks.units = [
      { _id: "u-1", name: "9A", blockName: "Block C", status: "available", tenantId: "" },
    ];

    render(<TenantRequestsPage />);

    expect(screen.getByRole("button", { name: /Request move-out/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Request move-in/ })).toBeInTheDocument();
  });

  it("shows the manager's decision note on a decided move request", () => {
    mocks.moveRequests = [
      {
        ...approvedMoveOut,
        decidedAt: "2026-10-07T09:00:00.000Z",
        decisionNote: "Handover scheduled for 30 Nov",
      },
    ];

    render(<TenantRequestsPage />);

    expect(screen.getByText(/Handover scheduled for 30 Nov/)).toBeInTheDocument();
  });

  it("filters by status", async () => {
    mocks.applications = [pendingApplication];
    mocks.moveRequests = [approvedMoveOut];

    render(<TenantRequestsPage />);

    await userEvent.click(screen.getByRole("tab", { name: "Pending" }));

    expect(screen.getByText("Sunrise Court")).toBeInTheDocument();
    expect(screen.queryByText(/5B/)).toBeNull();
  });
});
