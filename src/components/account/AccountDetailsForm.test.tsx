import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AccountDetailsForm } from "@/components/account/AccountDetailsForm";
import type { KejaUser } from "@/hooks/use-auth";

const baseUser: KejaUser = {
  id: "u1",
  email: "amina@keja.co",
  name: "Amina Otieno",
  role: "tenant",
  phone: "+254712345678",
  whatsapp: "",
  nationalId: "12345678",
};

const setup = (overrides: Partial<KejaUser> = {}, onSave = vi.fn().mockResolvedValue(true)) => {
  const onSignOut = vi.fn();
  render(
    <AccountDetailsForm
      user={{ ...baseUser, ...overrides }}
      onSave={onSave}
      onSignOut={onSignOut}
    />,
  );
  return { onSave, onSignOut };
};

describe("AccountDetailsForm", () => {
  it("prefills the account's contact and identity fields", () => {
    setup();
    expect(screen.getByLabelText("Display name")).toHaveValue("Amina Otieno");
    expect(screen.getByLabelText("Mobile number")).toHaveValue("712345678");
    expect(screen.getByLabelText("National ID number")).toHaveValue("12345678");
  });

  it("submits the mobile number as E.164 and normalises the national id", async () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "0733 111 222" } });
    fireEvent.change(screen.getByLabelText("National ID number"), {
      target: { value: "12-345 678" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        name: "Amina Otieno",
        phone: "+254733111222",
        whatsapp: "",
        nationalId: "12345678",
      }),
    );
  });

  it("sends an empty WhatsApp number when it matches the mobile", async () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ whatsapp: "" })),
    );
  });

  it("captures a separate WhatsApp number when the toggle is turned off", async () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByRole("switch", { name: /whatsapp is the same as mobile/i }));
    fireEvent.change(screen.getByLabelText("WhatsApp number"), {
      target: { value: "0700 000 000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ whatsapp: "+254700000000" })),
    );
  });

  it("allows clearing the mobile number", async () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ phone: "" })),
    );
  });

  it("calls sign out", () => {
    const { onSignOut } = setup();
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalled();
  });

  it("shows a pre-existing WhatsApp number and starts with the toggle off", () => {
    setup({ whatsapp: "+254700000000" });
    expect(screen.getByLabelText("WhatsApp number")).toHaveValue("700000000");
  });
});
