import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CaretakerRow } from "@/hooks/use-caretakers";

const mocks = vi.hoisted(() => {
  const list = [] as CaretakerRow[];
  const flags = {
    loading: false,
    error: null as string | null,
    pendingId: null as string | null,
  };
  const updatePrivileges = vi.fn();
  const toast = { success: vi.fn(), error: vi.fn() };
  return {
    list,
    flags,
    updatePrivileges,
    toast,
    useCaretakers: () => ({
      caretakers: list,
      loading: flags.loading,
      error: flags.error,
      refetch: vi.fn(),
    }),
    useUpdateCaretakerPrivileges: () => ({
      updatePrivileges,
      pendingId: flags.pendingId,
      error: null,
    }),
  };
});

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/hooks/use-caretakers", () => ({
  useCaretakers: mocks.useCaretakers,
  useUpdateCaretakerPrivileges: mocks.useUpdateCaretakerPrivileges,
}));

import { CaretakerPrivilegesTable } from "@/components/team/CaretakerPrivilegesTable";

const caretakerRows: CaretakerRow[] = [
  {
    id: "care-1",
    name: "Amka",
    email: "amka@keja.co",
    managedByOwnerId: "owner-1",
    privileges: ["manage_tenants"],
    propertyCount: 3,
  },
];

describe("CaretakerPrivilegesTable", () => {
  beforeEach(() => {
    mocks.list.length = 0;
    mocks.flags.loading = false;
    mocks.flags.error = null;
    mocks.flags.pendingId = null;
    mocks.toast.success.mockClear();
    mocks.toast.error.mockClear();
    mocks.updatePrivileges.mockReset();
  });

  it("renders one switch per configurable privilege (manage_invoices is not exposed)", () => {
    mocks.list.push(...caretakerRows);
    render(<CaretakerPrivilegesTable />);

    expect(screen.getByText("Amka")).toBeInTheDocument();
    expect(screen.getByText("amka@keja.co")).toBeInTheDocument();
    // Manage tenants is checked by default
    expect(screen.getByRole("switch", { name: "Manage tenants for Amka" })).toBeChecked();
    // Exactly 4 privilege switches per row — NOT manage_invoices
    expect(screen.getAllByRole("switch")).toHaveLength(4);
    expect(screen.getAllByRole("switch", { name: /for Amka/ })).toHaveLength(4);
  });

  it("counts properties in the badge", () => {
    mocks.list.push(...caretakerRows);
    render(<CaretakerPrivilegesTable />);

    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("sends the toggled privilege list to the API", async () => {
    const user = userEvent.setup();
    mocks.list.push(...caretakerRows);
    mocks.updatePrivileges.mockResolvedValue({
      ...caretakerRows[0],
      privileges: ["manage_tenants", "create_property"],
    });
    render(<CaretakerPrivilegesTable />);

    await user.click(screen.getByRole("switch", { name: "Create property for Amka" }));

    await waitFor(() =>
      expect(mocks.updatePrivileges).toHaveBeenCalledWith("care-1", [
        "manage_tenants",
        "create_property",
      ]),
    );
    expect(mocks.toast.success).toHaveBeenCalledWith("Amka's privileges updated");
  });

  it("rolls back the optimistic update and shows an error toast on failure", async () => {
    const user = userEvent.setup();
    mocks.list.push(...caretakerRows);
    mocks.updatePrivileges.mockRejectedValue(new Error("Caretaker is bound to another owner"));
    render(<CaretakerPrivilegesTable />);

    await user.click(screen.getByRole("switch", { name: "Create property for Amka" }));

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled());
    expect(mocks.toast.error).toHaveBeenCalledWith("Could not update privileges", {
      description: "Caretaker is bound to another owner",
    });
    // Rolled back — manage_tenants remains the only checked privilege
    expect(screen.getByRole("switch", { name: "Manage tenants for Amka" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Create property for Amka" })).not.toBeChecked();
  });

  it("shows the loading state while fetching", () => {
    mocks.flags.loading = true;
    render(<CaretakerPrivilegesTable />);
    expect(screen.getByText("Loading caretakers…")).toBeInTheDocument();
  });

  it("shows the error state", () => {
    mocks.flags.error = "Failed to fetch caretakers";
    render(<CaretakerPrivilegesTable />);
    expect(screen.getByText("Failed to fetch caretakers")).toBeInTheDocument();
  });

  it("shows the empty state", () => {
    render(<CaretakerPrivilegesTable />);
    expect(screen.getByText("No caretakers yet")).toBeInTheDocument();
  });
});
