import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const inviteMember = vi.fn();
  const toast = { success: vi.fn(), error: vi.fn() };
  return {
    inviteMember,
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
    await user.click(screen.getByRole("button", { name: /send invitation/i }));

    await waitFor(() =>
      expect(mocks.inviteMember).toHaveBeenCalledWith(
        expect.objectContaining({ role: "caretaker", email: "care@keja.co" }),
      ),
    );
  });

  it("requires at least one contact", async () => {
    const user = userEvent.setup();
    render(<TeamInviteCard allowedRoles={["caretaker"]} />);

    await user.click(screen.getByRole("button", { name: /send invitation/i }));

    expect(screen.getByText("Provide an email or phone")).toBeInTheDocument();
    expect(mocks.inviteMember).not.toHaveBeenCalled();
  });

  it("shows a one-time password dialog for a phone-only invite", async () => {
    const user = userEvent.setup();
    mocks.inviteMember.mockResolvedValue({ temporaryPassword: "temp-pass-123" });
    render(<TeamInviteCard allowedRoles={["caretaker"]} />);

    await user.type(screen.getByLabelText("Phone"), "712345678");
    await user.click(screen.getByRole("button", { name: /send invitation/i }));

    await waitFor(() => expect(screen.getByText("temp-pass-123")).toBeInTheDocument());
    expect(mocks.inviteMember).toHaveBeenCalledWith(
      expect.objectContaining({ role: "caretaker", phone: "+254712345678" }),
    );
  });

  it("never shows a temporary password for an email invite", async () => {
    const user = userEvent.setup();
    mocks.inviteMember.mockResolvedValue({ temporaryPassword: "should-not-render" });
    render(<TeamInviteCard allowedRoles={["caretaker"]} />);

    await user.type(screen.getByLabelText("Email"), "care@keja.co");
    await user.click(screen.getByRole("button", { name: /send invitation/i }));

    await waitFor(() => expect(mocks.inviteMember).toHaveBeenCalled());
    expect(screen.queryByText("should-not-render")).not.toBeInTheDocument();
    expect(mocks.toast.success).toHaveBeenCalledWith(
      "Invitation sent",
      expect.objectContaining({ description: expect.any(String) }),
    );
  });
});
