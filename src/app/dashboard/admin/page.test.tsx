import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const emptyList: never[] = [];
  return {
    useAmounts: () => ({ amounts: emptyList, loading: false, error: null, refetch: vi.fn() }),
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
vi.mock("@/hooks/use-amounts", () => ({ useAmounts: mocks.useAmounts }));
vi.mock("@/hooks/use-caretakers", () => ({ useCaretakers: mocks.useCaretakers }));
vi.mock("@/hooks/use-properties", () => ({ useProperties: mocks.useProperties }));
vi.mock("@/hooks/use-tenants", () => ({ useTenants: mocks.useTenants }));

import AdminDashboard from "@/app/dashboard/admin/page";

describe("admin dashboard", () => {
  it("renders the portfolio overview shell", () => {
    render(<AdminDashboard />);
    expect(screen.getByText("Portfolio overview")).toBeInTheDocument();
  });
});
