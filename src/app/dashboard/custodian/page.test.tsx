import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const emptyList: never[] = [];
  return {
    useProperties: () => ({ properties: emptyList, loading: false, error: null, refetch: vi.fn() }),
    useUnits: () => ({ units: emptyList, loading: false, error: null, total: 0, refetch: vi.fn() }),
  };
});

vi.mock("@/components/DashboardShell", async () => {
  const { createElement, Fragment } = await import("react");
  return {
    DashboardShell: (props: { title?: string; children?: React.ReactNode }) =>
      createElement(Fragment, null, props.title, props.children),
  };
});
vi.mock("@/hooks/use-properties", () => ({ useProperties: mocks.useProperties }));
vi.mock("@/hooks/use-units", () => ({ useUnits: mocks.useUnits }));

import CustodianDashboard from "@/app/dashboard/custodian/page";

describe("custodian dashboard", () => {
  it("renders the custodian overview shell", () => {
    render(<CustodianDashboard />);
    expect(screen.getByText("Custodian overview")).toBeInTheDocument();
  });
});
