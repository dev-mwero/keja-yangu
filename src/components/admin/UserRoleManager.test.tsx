import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const users: Array<Record<string, unknown>> = [];
  const flags = { loading: false, error: null as string | null };
  const refetch = vi.fn();
  const promoteUserRole = vi.fn().mockResolvedValue({});
  const setUserStatus = vi.fn().mockResolvedValue({});
  const toast = { success: vi.fn(), error: vi.fn() };
  return {
    users,
    flags,
    refetch,
    promoteUserRole,
    setUserStatus,
    toast,
    currentUser: { id: "me", email: "me@keja.co" } as Record<string, unknown>,
    pagination: null as null | Record<string, unknown>,
    useUsers: () => ({
      users,
      pagination: mocks.pagination,
      loading: flags.loading,
      error: flags.error,
      refetch,
    }),
    useUserRolePromotion: () => ({
      promoteUserRole,
      pending: false,
      pendingId: null,
      error: null,
    }),
    useUserActivation: () => ({
      setUserStatus,
      pending: false,
      pendingId: null,
      error: null,
    }),
    useAuth: () => ({ user: mocks.currentUser }),
  };
});

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/hooks/use-users", () => ({
  useUsers: mocks.useUsers,
  useUserRolePromotion: mocks.useUserRolePromotion,
  useUserActivation: mocks.useUserActivation,
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: mocks.useAuth }));

import { UserRoleManager } from "@/components/admin/UserRoleManager";

function resetState() {
  mocks.users.length = 0;
  mocks.pagination = null;
  mocks.flags.loading = false;
  mocks.flags.error = null;
  mocks.refetch.mockClear();
  mocks.promoteUserRole.mockClear();
  mocks.setUserStatus.mockClear();
  mocks.toast.success.mockClear();
  mocks.toast.error.mockClear();
  mocks.currentUser = { id: "me", email: "me@keja.co" };
}

beforeEach(resetState);

function seedUsers() {
  mocks.users.push(
    { id: "u1", name: "Amina Otieno", email: "amina@keja.co", role: "tenant", isActive: true },
    { id: "u2", name: "Brian Mwangi", email: "brian@keja.co", role: "admin", isActive: true },
    { id: "u3", name: "Root Admin", email: "root@keja.co", role: "system-admin", isActive: true },
  );
}

describe("UserRoleManager", () => {
  it("renders the users table with role badges", () => {
    seedUsers();
    render(<UserRoleManager />);

    expect(screen.getByText("Amina Otieno")).toBeInTheDocument();
    expect(screen.getByText("Brian Mwangi")).toBeInTheDocument();
    expect(screen.getByText("Root Admin")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /amina otieno/i })).toBeInTheDocument();
  });

  it("marks system-admin rows as CLI-managed with no role editor", () => {
    seedUsers();
    render(<UserRoleManager />);

    const rootRow = screen.getByRole("row", { name: /root admin/i });
    expect(within(rootRow).getByText("CLI-managed")).toBeInTheDocument();
    expect(within(rootRow).queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("disables the role editor on your own row", () => {
    mocks.users.push({
      id: "me",
      name: "Self User",
      email: "me@keja.co",
      role: "system-admin",
      isActive: true,
    });
    render(<UserRoleManager />);

    expect(screen.getByText("You")).toBeInTheDocument();
    const selfRow = screen.getByRole("row", { name: /self user/i });
    expect(within(selfRow).queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("promotes to an assignable role through the confirmation dialog", async () => {
    seedUsers();
    mocks.promoteUserRole.mockResolvedValue({
      id: "u1",
      name: "Amina Otieno",
      email: "amina@keja.co",
      role: "admin",
      isActive: true,
    });
    render(<UserRoleManager />);

    const aminaRow = screen.getByRole("row", { name: /amina otieno/i });
    const user = userEvent.setup();
    await user.click(within(aminaRow).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "admin" }));

    expect(
      await screen.findByText(/change amina otieno from tenant to admin/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(mocks.promoteUserRole).toHaveBeenCalledWith("u1", "admin");
    expect(mocks.toast.success).toHaveBeenCalled();
    expect(mocks.refetch).toHaveBeenCalled();
  });

  it("never offers system-admin as an assignable role", async () => {
    seedUsers();
    render(<UserRoleManager />);

    const aminaRow = screen.getByRole("row", { name: /amina otieno/i });
    const user = userEvent.setup();
    await user.click(within(aminaRow).getByRole("combobox"));
    expect(await screen.findByRole("option", { name: "broker" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "system-admin" })).not.toBeInTheDocument();
  });

  it("cancel leaves the role unchanged", async () => {
    seedUsers();
    render(<UserRoleManager />);

    const aminaRow = screen.getByRole("row", { name: /amina otieno/i });
    const user = userEvent.setup();
    await user.click(within(aminaRow).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "broker" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mocks.promoteUserRole).not.toHaveBeenCalled();
  });

  it("shows a disabled message when role management is off", () => {
    mocks.flags.error = "Role management is disabled";
    render(<UserRoleManager />);

    expect(screen.getByText("Role management disabled")).toBeInTheDocument();
  });

  it("shows an empty state when there are no users", () => {
    render(<UserRoleManager />);
    expect(screen.getByText(/no users found/i)).toBeInTheDocument();
  });

  it("deactivates an account through the confirmation dialog", async () => {
    seedUsers();
    render(<UserRoleManager />);

    const aminaRow = screen.getByRole("row", { name: /amina otieno/i });
    const user = userEvent.setup();
    await user.click(within(aminaRow).getByRole("button", { name: /deactivate/i }));

    expect(await screen.findByText(/deactivate this account\?/i)).toBeInTheDocument();
    expect(screen.getByText(/portfolio assignments revoked/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Yes, deactivate" }));
    expect(mocks.setUserStatus).toHaveBeenCalledWith("u1", false);
    expect(mocks.refetch).toHaveBeenCalled();
  });

  it("offers reactivation for inactive accounts", async () => {
    mocks.users.push({
      id: "u4",
      name: "Dormant User",
      email: "dormant@keja.co",
      role: "caretaker",
      isActive: false,
    });
    render(<UserRoleManager />);

    const row = screen.getByRole("row", { name: /dormant user/i });
    const user = userEvent.setup();
    await user.click(within(row).getByRole("button", { name: /reactivate/i }));
    await user.click(screen.getByRole("button", { name: "Yes, reactivate" }));

    expect(mocks.setUserStatus).toHaveBeenCalledWith("u4", true);
  });

  it("never offers a status toggle for system-admin accounts", () => {
    seedUsers();
    render(<UserRoleManager />);

    const rootRow = screen.getByRole("row", { name: /root admin/i });
    expect(within(rootRow).queryByRole("button", { name: /deactivate/i })).not.toBeInTheDocument();
  });
});
