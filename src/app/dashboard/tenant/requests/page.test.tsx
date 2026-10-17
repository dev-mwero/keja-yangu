import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/DashboardShell", async () => {
  const { createElement } = await import("react");
  return {
    DashboardShell: (props: { children?: React.ReactNode }) =>
      createElement("div", null, props.children),
  };
});
vi.mock("@/components/tenant/TenantApplicationsPanel", async () => {
  const { createElement } = await import("react");
  return { TenantApplicationsPanel: () => createElement("div", null, "Applications panel") };
});
vi.mock("@/components/tenant/TenantMoveRequestsPanel", async () => {
  const { createElement } = await import("react");
  return { TenantMoveRequestsPanel: () => createElement("div", null, "Move requests panel") };
});
vi.mock("@/config/dashboardNav", () => ({ tenantNav: [] }));

import TenantRequestsPage from "@/app/dashboard/tenant/requests/page";

describe("tenant requests page", () => {
  it("shows applications first and switches to move requests", async () => {
    render(<TenantRequestsPage />);

    expect(screen.getByRole("tab", { name: "Applications" })).toBeInTheDocument();
    expect(screen.getByText("Applications panel")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Move requests" }));

    expect(await screen.findByText("Move requests panel")).toBeInTheDocument();
  });
});
