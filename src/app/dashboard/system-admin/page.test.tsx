import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const emptyList: never[] = [];
  return {
    useCaretakers: () => ({ caretakers: emptyList, loading: false, error: null, refetch: vi.fn() }),
    useProperties: () => ({ properties: emptyList, loading: false, error: null, refetch: vi.fn() }),
    useTenants: () => ({ tenants: emptyList, loading: false, error: null, refetch: vi.fn() }),
  };
});

vi.mock("@/components/DashboardShell", async () => {
  const { createElement, Fragment } = await import("react");
  return {
    DashboardShell: (props: { title?: string; children?: React.ReactNode }) =>
      createElement(Fragment, null, props.title, props.children),
  };
});
vi.mock("@/hooks/use-caretakers", () => ({ useCaretakers: mocks.useCaretakers }));
vi.mock("@/hooks/use-properties", () => ({ useProperties: mocks.useProperties }));
vi.mock("@/hooks/use-tenants", () => ({ useTenants: mocks.useTenants }));

import SystemAdminDashboard from "@/app/dashboard/system-admin/page";

describe("system-admin dashboard", () => {
  it("renders the platform overview shell", () => {
    render(<SystemAdminDashboard />);
    expect(screen.getByText("Platform overview")).toBeInTheDocument();
  });
});
