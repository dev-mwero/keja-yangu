import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const emptyList: never[] = [];
  return {
    currentUser: { id: "me", name: "Carl", email: "carl@keja.co" } as Record<string, unknown>,
    useAuth: () => ({ user: mocks.currentUser }),
    useCaretakerNav: () => emptyList,
    useProperties: () => ({ properties: emptyList, loading: false, error: null, refetch: vi.fn() }),
    useToast: () => ({ toast: vi.fn() }),
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
vi.mock("@/hooks/use-caretaker-nav", () => ({ useCaretakerNav: mocks.useCaretakerNav }));
vi.mock("@/hooks/use-properties", () => ({ useProperties: mocks.useProperties }));
vi.mock("@/hooks/use-toast", () => ({ useToast: mocks.useToast }));

import CaretakerDashboard from "@/app/dashboard/caretaker/page";

describe("caretaker dashboard", () => {
  it("renders the greeting shell", () => {
    render(<CaretakerDashboard />);
    expect(screen.getByText("Hello, Carl")).toBeInTheDocument();
  });
});
