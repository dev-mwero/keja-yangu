import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnerPaymentConfigView } from "@/lib/payments/methods";

const mocks = vi.hoisted(() => {
  const state = {
    config: {} as OwnerPaymentConfigView,
    loading: false,
    saving: false,
    error: null as string | null,
  };
  const save = vi.fn();
  const toast = { success: vi.fn(), error: vi.fn() };
  return {
    state,
    save,
    toast,
    useOwnerPaymentConfig: vi.fn(() => ({
      config: state.config,
      loading: state.loading,
      saving: state.saving,
      error: state.error,
      save,
    })),
  };
});

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/hooks/use-owner-payment-config", () => ({
  useOwnerPaymentConfig: mocks.useOwnerPaymentConfig,
}));

import { PaymentMethodsSettings } from "@/components/settings/PaymentMethodsSettings";

function makeConfig(overrides: Partial<OwnerPaymentConfigView> = {}): OwnerPaymentConfigView {
  return {
    daraja: {
      enabled: false,
      environment: "sandbox",
      shortcode: "",
      consumerKeyConfigured: false,
      consumerSecretConfigured: false,
      passphraseConfigured: false,
    },
    mpesaConfigured: false,
    availableMethods: ["manual"],
    ...overrides,
  };
}

describe("PaymentMethodsSettings", () => {
  beforeEach(() => {
    mocks.state.config = makeConfig();
    mocks.state.loading = false;
    mocks.state.saving = false;
    mocks.state.error = null;
    mocks.save.mockReset().mockResolvedValue(true);
    mocks.toast.success.mockClear();
    mocks.toast.error.mockClear();
    mocks.useOwnerPaymentConfig.mockClear();
  });

  it("marks manual as always on and hides the Daraja form when disabled", () => {
    render(<PaymentMethodsSettings />);
    expect(screen.getByText("Always on")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Environment/i)).not.toBeInTheDocument();
    expect(screen.getByText("Not configured")).toBeInTheDocument();
  });

  it("shows the Daraja fields when enabled and marks M-Pesa active when configured", () => {
    mocks.state.config = makeConfig({
      daraja: { ...makeConfig().daraja, enabled: true },
      mpesaConfigured: true,
    });
    render(<PaymentMethodsSettings />);
    expect(screen.getByLabelText(/Environment/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/shortcode/i)).toBeInTheDocument();
    expect(screen.getByText(/M-Pesa is active/i)).toBeInTheDocument();
  });

  it("shows Paystack as available when the platform is configured", () => {
    mocks.state.config = makeConfig({ availableMethods: ["manual", "paystack"] });
    render(<PaymentMethodsSettings />);
    expect(screen.getByText("Available")).toBeInTheDocument();
  });

  it("saves the Daraja patch, omitting untouched secrets", async () => {
    const user = userEvent.setup();
    mocks.state.config = makeConfig({
      daraja: { ...makeConfig().daraja, enabled: true, consumerKeyConfigured: true },
    });
    render(<PaymentMethodsSettings />);

    await user.type(screen.getByLabelText(/shortcode/i), "174379");
    await user.click(screen.getByRole("button", { name: /Save payment settings/i }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save).toHaveBeenCalledWith({
      darajaEnabled: true,
      daraja: { environment: "sandbox", shortcode: "174379" },
    });
    expect(mocks.toast.success).toHaveBeenCalled();
  });

  it("includes secrets when the owner types them", async () => {
    const user = userEvent.setup();
    mocks.state.config = makeConfig({ daraja: { ...makeConfig().daraja, enabled: true } });
    render(<PaymentMethodsSettings />);

    await user.type(screen.getByLabelText(/Consumer key/i), "ck");
    await user.type(screen.getByLabelText(/shortcode/i), "174379");
    await user.click(screen.getByRole("button", { name: /Save payment settings/i }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save).toHaveBeenCalledWith({
      darajaEnabled: true,
      daraja: { environment: "sandbox", shortcode: "174379", consumerKey: "ck" },
    });
  });

  it("toasts an error when the save fails", async () => {
    const user = userEvent.setup();
    mocks.save.mockResolvedValue(false);
    render(<PaymentMethodsSettings />);

    await user.click(screen.getByRole("button", { name: /Save payment settings/i }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled());
  });
});
