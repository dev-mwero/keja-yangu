import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const inviteMember = vi.fn();
  const identitySearch = vi.fn();
  const toast = { success: vi.fn(), error: vi.fn() };
  return {
    inviteMember,
    identitySearch,
    toast,
    useTeamInvites: () => ({ inviteMember, pending: false, error: null }),
  };
});

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/hooks/use-team-invites", () => ({
  useTeamInvites: mocks.useTeamInvites,
}));

import { TeamInviteCard } from "@/components/team/TeamInviteCard";

describe("TeamInviteCard", () => {
  beforeEach(() => {
    mocks.inviteMember.mockReset();
    mocks.identitySearch.mockReset().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });
    vi.stubGlobal("fetch", mocks.identitySearch);
    mocks.toast.success.mockClear();
    mocks.toast.error.mockClear();
  });

  it("uses the selected role when submitting", async () => {
    const user = userEvent.setup();
    mocks.inviteMember.mockResolvedValue({});
    render(<TeamInviteCard allowedRoles={["custodian", "caretaker"]} />);

    await user.click(screen.getByRole("combobox", { name: "Role" }));
    await user.click(screen.getByRole("option", { name: "Caretaker" }));
    await user.type(screen.getByLabelText("Email"), "care@keja.co");
    await user.click(screen.getByRole("button", { name: /check account and continue/i }));

    await waitFor(() =>
      expect(mocks.inviteMember).toHaveBeenCalledWith(
        expect.objectContaining({ role: "caretaker", email: "care@keja.co" }),
      ),
    );
    expect(mocks.identitySearch).toHaveBeenCalledWith(expect.stringContaining("role=caretaker"));
  });

  it("requires at least one contact", async () => {
    const user = userEvent.setup();
    render(<TeamInviteCard allowedRoles={["caretaker"]} />);

    await user.click(screen.getByRole("button", { name: /check account and continue/i }));

    expect(screen.getByText("Provide an email or phone")).toBeInTheDocument();
    expect(mocks.inviteMember).not.toHaveBeenCalled();
  });

  it("shows a one-time password dialog for a phone-only invite", async () => {
    const user = userEvent.setup();
    mocks.inviteMember.mockResolvedValue({ temporaryPassword: "temp-pass-123" });
    render(<TeamInviteCard allowedRoles={["caretaker"]} />);

    await user.type(screen.getByLabelText("Phone"), "712345678");
    await user.click(screen.getByRole("button", { name: /check account and continue/i }));

    await waitFor(() => expect(screen.getByText("temp-pass-123")).toBeInTheDocument());
    expect(mocks.inviteMember).toHaveBeenCalledWith(
      expect.objectContaining({ role: "caretaker", phone: "+254712345678" }),
    );
  });

  it("checks before invite and asks for confirmation before linking an existing account", async () => {
    const user = userEvent.setup();
    mocks.identitySearch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "existing-caretaker",
            name: "Existing Caretaker",
            email: "care@keja.co",
            role: "caretaker",
            isActive: true,
            hasVerifiedEmail: true,
            canLink: true,
          },
        ],
      }),
    });
    mocks.inviteMember.mockResolvedValue({ linked: true });
    render(<TeamInviteCard allowedRoles={["caretaker"]} />);

    await user.type(screen.getByLabelText("Email"), "care@keja.co");
    await user.click(screen.getByRole("button", { name: /check account and continue/i }));

    expect(await screen.findByText("An existing caretaker account was found")).toBeInTheDocument();
    expect(screen.getByText(/no duplicate account will be created/i)).toBeInTheDocument();
    expect(mocks.inviteMember).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /link existing account/i }));
    await waitFor(() => expect(mocks.inviteMember).toHaveBeenCalledTimes(1));
    expect(mocks.toast.success).toHaveBeenCalledWith("Team member linked");
  });

  it("does not invite a contact when the existing account cannot be linked", async () => {
    const user = userEvent.setup();
    mocks.identitySearch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "existing-tenant",
            name: "Existing Tenant",
            email: "tenant@keja.co",
            role: "tenant",
            isActive: true,
            hasVerifiedEmail: true,
            canLink: false,
            linkReason: "This contact is already registered to a different role.",
          },
        ],
      }),
    });
    render(<TeamInviteCard allowedRoles={["caretaker"]} />);

    await user.type(screen.getByLabelText("Email"), "tenant@keja.co");
    await user.click(screen.getByRole("button", { name: /check account and continue/i }));

    expect(
      await screen.findByText("This contact is already registered to a different role."),
    ).toBeInTheDocument();
    expect(mocks.inviteMember).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /check account and continue/i })).toBeDisabled();
  });

  it("never shows a temporary password for an email invite", async () => {
    const user = userEvent.setup();
    mocks.inviteMember.mockResolvedValue({ temporaryPassword: "should-not-render" });
    render(<TeamInviteCard allowedRoles={["caretaker"]} />);

    await user.type(screen.getByLabelText("Email"), "care@keja.co");
    await user.click(screen.getByRole("button", { name: /check account and continue/i }));

    await waitFor(() => expect(mocks.inviteMember).toHaveBeenCalled());
    expect(screen.queryByText("should-not-render")).not.toBeInTheDocument();
    expect(mocks.toast.success).toHaveBeenCalledWith(
      "Invitation sent",
      expect.objectContaining({ description: expect.any(String) }),
    );
  });
});
