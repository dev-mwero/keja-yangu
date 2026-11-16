import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    currentUser: { id: "me", name: "Bella Broker", email: "broker@keja.co" } as Record<
      string,
      unknown
    >,
    useAuth: () => ({ user: mocks.currentUser }),
  };
});

vi.mock("@/components/DashboardShell", async () => {
  const { createElement, Fragment } = await import("react");
  return {
    DashboardShell: (props: { title?: string; children?: React.ReactNode }) =>
      createElement(Fragment, null, props.title, props.children),
  };
});
vi.mock("@/hooks/use-auth", () => ({ useAuth: mocks.useAuth }));

import BrokerDashboard from "@/app/dashboard/broker/page";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("broker dashboard", () => {
  it("renders the broker workspace shell", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: async () => ({}) as Response,
        }),
      ),
    );

    render(<BrokerDashboard />);
    expect(screen.getByText("Broker Workspace")).toBeInTheDocument();
  });
});
