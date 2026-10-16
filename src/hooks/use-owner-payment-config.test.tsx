import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOwnerPaymentConfig } from "@/hooks/use-owner-payment-config";
import type { OwnerPaymentConfigView } from "@/lib/payments/methods";

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

function stubFetch(result: { ok?: boolean; json?: unknown }) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: result.ok ?? true,
      status: result.ok === false ? 400 : 200,
      json: vi.fn().mockResolvedValue(result.json),
    }),
  );
}

describe("useOwnerPaymentConfig", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the masked config from GET /api/v1/owner/payment-config", async () => {
    const config = makeConfig({ availableMethods: ["manual", "mpesa"], mpesaConfigured: true });
    stubFetch({ json: { data: config } });
    const { result } = renderHook(() => useOwnerPaymentConfig());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/v1/owner/payment-config");
    expect(result.current.config).toEqual(config);
    expect(result.current.error).toBeNull();
  });

  it("falls back to manual-only and surfaces the error on failure", async () => {
    stubFetch({ ok: false, json: { error: "Forbidden" } });
    const { result } = renderHook(() => useOwnerPaymentConfig());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.config.availableMethods).toEqual(["manual"]);
    expect(result.current.error).toBe("Forbidden");
  });

  it("saves via PUT and replaces state with the server response", async () => {
    stubFetch({ json: { data: makeConfig() } });
    const { result } = renderHook(() => useOwnerPaymentConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const updated = makeConfig({
      daraja: { ...makeConfig().daraja, enabled: true, consumerKeyConfigured: true },
      mpesaConfigured: true,
      availableMethods: ["manual", "mpesa"],
    });
    stubFetch({ json: { data: updated } });

    let okay = false;
    await act(async () => {
      okay = await result.current.save({
        darajaEnabled: true,
        daraja: { environment: "sandbox", shortcode: "174379", consumerKey: "ck" },
      });
    });
    expect(okay).toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenLastCalledWith("/api/v1/owner/payment-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        darajaEnabled: true,
        daraja: { environment: "sandbox", shortcode: "174379", consumerKey: "ck" },
      }),
    });
    expect(result.current.config.mpesaConfigured).toBe(true);
  });

  it("returns false and keeps the previous config when the save fails", async () => {
    const config = makeConfig({ mpesaConfigured: true, availableMethods: ["manual", "mpesa"] });
    stubFetch({ json: { data: config } });
    const { result } = renderHook(() => useOwnerPaymentConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    stubFetch({ ok: false, json: { error: "Invalid payment config payload" } });

    let okay = true;
    await act(async () => {
      okay = await result.current.save({ darajaEnabled: false });
    });
    expect(okay).toBe(false);
    expect(result.current.config).toEqual(config);
    expect(result.current.error).toBe("Invalid payment config payload");
  });
});
