import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const moveRequests: Array<Record<string, unknown>> = [];
  return {
    moveRequests,
    useMoveRequests: () => ({
      moveRequests,
      loading: false,
      error: null,
      refetch: vi.fn(),
    }),
    useMoveRequestMutations: () => ({ decide: vi.fn(), create: vi.fn(), pending: false }),
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
vi.mock("@/hooks/use-move-requests", () => ({
  useMoveRequests: mocks.useMoveRequests,
  useMoveRequestMutations: mocks.useMoveRequestMutations,
}));

import { MoveRequestsView } from "@/components/move-requests/MoveRequestsView";

const rows = [
  {
    _id: "mr-1",
    type: "move-in",
    requestedByRole: "tenant",
    note: "Needs the ground floor unit",
    status: "pending",
    requestedDate: "2026-02-01T00:00:00.000Z",
  },
  {
    _id: "mr-2",
    type: "move-out",
    requestedByRole: "caretaker",
    note: "Relocating to Mombasa",
    status: "pending",
    requestedDate: "2026-02-02T00:00:00.000Z",
  },
];

describe("MoveRequestsView search", () => {
  beforeEach(() => {
    mocks.moveRequests.length = 0;
  });

  it("filters move requests by the search box", async () => {
    mocks.moveRequests.push(...rows);
    render(<MoveRequestsView nav={[]} roleName="Owner" />);

    expect(screen.getByText("Needs the ground floor unit")).toBeInTheDocument();
    expect(screen.getByText("Relocating to Mombasa")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("Search requests…"), "mombasa");

    expect(screen.getByText("Relocating to Mombasa")).toBeInTheDocument();
    expect(screen.queryByText("Needs the ground floor unit")).not.toBeInTheDocument();
  });
});
