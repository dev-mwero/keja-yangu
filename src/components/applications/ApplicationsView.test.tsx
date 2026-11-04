import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const applications: Array<Record<string, unknown>> = [];
  const state = { loading: false };
  return {
    applications,
    state,
    useApplications: () => ({
      applications,
      loading: state.loading,
      error: null,
      refetch: vi.fn(),
      refresh: vi.fn(),
    }),
    useApplicationMutations: () => ({
      decide: vi.fn(),
      create: vi.fn(),
      withdraw: vi.fn(),
      pending: false,
    }),
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
vi.mock("@/hooks/use-applications", () => ({
  useApplications: mocks.useApplications,
  useApplicationMutations: mocks.useApplicationMutations,
}));

import { ApplicationsView } from "@/components/applications/ApplicationsView";

const rows = [
  {
    id: "app-1",
    propertyTitle: "Sunset Villa",
    unitId: "unit-1",
    unitName: "3A",
    applicantName: "Amina",
    applicantEmail: "amina@keja.co",
    message: "Needs the ground floor unit",
    status: "pending",
    submittedAt: "2026-02-01T00:00:00.000Z",
  },
  {
    id: "app-2",
    propertyTitle: "Riverside Court",
    unitId: "",
    unitName: "",
    applicantName: "Brian",
    applicantEmail: "brian@keja.co",
    message: "Relocating to Mombasa",
    status: "pending",
    submittedAt: "2026-02-02T00:00:00.000Z",
  },
];

describe("ApplicationsView search", () => {
  beforeEach(() => {
    mocks.applications.length = 0;
    mocks.state.loading = false;
  });

  it("filters applications by the search box", async () => {
    mocks.applications.push(...rows);
    render(<ApplicationsView nav={[]} roleName="Owner" />);

    expect(screen.getByText("Needs the ground floor unit")).toBeInTheDocument();
    expect(screen.getByText("Relocating to Mombasa")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("Search applications…"), "mombasa");

    expect(screen.getByText("Relocating to Mombasa")).toBeInTheDocument();
    expect(screen.queryByText("Needs the ground floor unit")).not.toBeInTheDocument();
  });

  it("renders the requested unit column", () => {
    mocks.applications.push(...rows);
    render(<ApplicationsView nav={[]} roleName="Owner" />);

    expect(screen.getByRole("columnheader", { name: "Unit" })).toBeInTheDocument();
    expect(screen.getByText("3A")).toBeInTheDocument();
  });

  it("filters applications by unit name", async () => {
    mocks.applications.push(...rows);
    render(<ApplicationsView nav={[]} roleName="Owner" />);

    await userEvent.type(screen.getByPlaceholderText("Search applications…"), "3A");

    expect(screen.getByText("Needs the ground floor unit")).toBeInTheDocument();
    expect(screen.queryByText("Relocating to Mombasa")).not.toBeInTheDocument();
  });

  it("spans 8 columns while loading", () => {
    mocks.state.loading = true;
    render(<ApplicationsView nav={[]} roleName="Owner" />);

    const cell = screen.getByText("Loading applications…");
    expect(cell).toHaveAttribute("colspan", "8");
  });

  it("labels approve as Approve & move in when a unit is requested, Admit when not", () => {
    mocks.applications.push(...rows);
    render(<ApplicationsView nav={[]} roleName="Owner" />);

    expect(screen.getByRole("button", { name: "Approve & move in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Admit" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });
});
