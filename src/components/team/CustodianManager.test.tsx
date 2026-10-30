import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustodianRow } from "@/hooks/use-custodians";

const mocks = vi.hoisted(() => {
  const custodians: CustodianRow[] = [];
  const toast = { success: vi.fn(), error: vi.fn() };
  return {
    custodians,
    toast,
    useCustodians: () => ({ custodians, loading: false, error: null, refetch: vi.fn() }),
    updateCustodianPrivileges: vi.fn(),
    useCustodianMutations: () => ({
      updateCustodianPrivileges: mocks.updateCustodianPrivileges,
      revokeCustodian: vi.fn(),
      pending: false,
    }),
  };
});

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/hooks/use-custodians", () => ({
  useCustodians: mocks.useCustodians,
  useCustodianMutations: mocks.useCustodianMutations,
}));

import { CustodianManager } from "@/components/team/CustodianManager";

const rows: CustodianRow[] = [
  {
    id: "cus-1",
    name: "Amina",
    email: "amina@keja.co",
    phone: "0700000001",
    managedByOwnerId: "owner-1",
    privileges: [],
  },
  {
    id: "cus-2",
    name: "Brian",
    email: "brian@keja.co",
    phone: "0700000002",
    managedByOwnerId: "owner-1",
    privileges: [],
  },
];

describe("CustodianManager", () => {
  beforeEach(() => {
    mocks.custodians.length = 0;
    mocks.updateCustodianPrivileges.mockReset();
    mocks.toast.success.mockClear();
    mocks.toast.error.mockClear();
  });

  it("filters custodians by the search box", async () => {
    mocks.custodians.push(...rows);
    render(<CustodianManager />);

    expect(screen.getByText("Amina")).toBeInTheDocument();
    expect(screen.getByText("Brian")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("Search custodians…"), "brian@");

    expect(screen.getByText("Brian")).toBeInTheDocument();
    expect(screen.queryByText("Amina")).not.toBeInTheDocument();
  });

  it("shows the privileged badge and toggles assign_privileges", async () => {
    const user = userEvent.setup();
    mocks.custodians.push({ ...rows[0], privileges: ["assign_privileges"] });
    render(<CustodianManager />);

    expect(screen.getByText("Privileged")).toBeInTheDocument();
    const toggle = screen.getByRole("switch", { name: "Assign privileges for Amina" });
    expect(toggle).toBeChecked();

    await user.click(toggle);

    await waitFor(() => expect(mocks.updateCustodianPrivileges).toHaveBeenCalledWith("cus-1", []));
    expect(mocks.toast.success).toHaveBeenCalledWith("Amina is no longer privileged");
  });

  it("falls back to a dash when a custodian has no email", () => {
    mocks.custodians.push({ ...rows[0], email: undefined });
    render(<CustodianManager />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
