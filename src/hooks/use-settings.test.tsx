import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, useSettings } from "@/hooks/use-settings";

function stubFetch(result: { ok?: boolean; json?: unknown; error?: unknown }) {
  const json = vi.fn();
  if (result.error) {
    json.mockRejectedValue(result.error);
  } else {
    json.mockResolvedValue(result.json);
  }
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({ ok: result.ok ?? true, status: result.ok === false ? 400 : 200, json }),
  );
}

describe("useSettings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads settings from GET /api/v1/settings and merges them over defaults", async () => {
    stubFetch({ json: { data: { emailNotifications: false, language: "sw" } } });
    const { result } = renderHook(() => useSettings());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/v1/settings");
    expect(result.current.settings).toEqual({
      ...DEFAULT_SETTINGS,
      emailNotifications: false,
      language: "sw",
    });
    expect(result.current.error).toBeNull();
  });

  it("keeps defaults and surfaces the API error on a non-ok response", async () => {
    stubFetch({ ok: false, json: { error: "Forbidden" } });
    const { result } = renderHook(() => useSettings());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
    expect(result.current.error).toBe("Forbidden");
  });

  it("update optimistically patches, sends the PATCH, and replaces with the server response", async () => {
    stubFetch({ json: { data: { marketingEmails: true } } });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let okay = false;
    await act(async () => {
      okay = await result.current.update({ marketingEmails: true, theme: "dark" });
    });
    expect(okay).toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/v1/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketingEmails: true, theme: "dark" }),
    });
    expect(result.current.settings.marketingEmails).toBe(true);
  });

  it("update rolls back to the previous settings and returns false on failure", async () => {
    stubFetch({ json: { data: { theme: "dark" } } });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.unstubAllGlobals();
    stubFetch({ ok: false, json: { error: "Invalid settings payload" } });

    let okay = true;
    await act(async () => {
      okay = await result.current.update({ language: "fr" });
    });
    expect(okay).toBe(false);
    expect(result.current.settings).toEqual({ ...DEFAULT_SETTINGS, theme: "dark" });
    expect(result.current.error).toBe("Invalid settings payload");
  });
});
