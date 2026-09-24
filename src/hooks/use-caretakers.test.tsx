import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaretakerRow } from "@/hooks/use-caretakers";
import { useCaretakers, useUpdateCaretakerPrivileges } from "@/hooks/use-caretakers";

const row: CaretakerRow = {
  id: "care-1",
  name: "Amka",
  email: "amka@keja.co",
  managedByOwnerId: "owner-1",
  privileges: ["manage_tenants"],
  propertyCount: 2,
};

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
      .mockResolvedValue({ ok: result.ok ?? true, status: result.ok === false ? 403 : 200, json }),
  );
}

describe("useCaretakers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the caretaker list from GET /api/v1/caretakers", async () => {
    stubFetch({ json: { data: [row] } });
    const { result } = renderHook(() => useCaretakers());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.caretakers).toEqual([row]);
    expect(result.current.error).toBeNull();
  });

  it("surfaces an API error message", async () => {
    stubFetch({ ok: false, json: { error: "Forbidden" } });
    const { result } = renderHook(() => useCaretakers());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Forbidden");
    expect(result.current.caretakers).toEqual([]);
  });

  it("surfaces a network failure", async () => {
    stubFetch({ error: new Error("Network error") });
    const { result } = renderHook(() => useCaretakers());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Network error");
  });

  it("refetch triggers a second request", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ data: [] }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ data: [row] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useCaretakers());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => result.current.refetch());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.caretakers).toEqual([row]));
  });
});

describe("useUpdateCaretakerPrivileges", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PUTs the new privilege list and returns the updated row", async () => {
    const updated = { ...row, privileges: ["manage_tenants", "create_property"] };
    stubFetch({ json: { data: updated } });
    const { result } = renderHook(() => useUpdateCaretakerPrivileges());

    await act(async () => {
      const returned = await result.current.updatePrivileges("care-1", [
        "manage_tenants",
        "create_property",
      ]);
      expect(returned).toEqual(updated);
    });
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/caretakers/care-1/privileges", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ privileges: ["manage_tenants", "create_property"] }),
    });
    expect(result.current.error).toBeNull();
    expect(result.current.pendingId).toBeNull();
  });

  it("throws and records the API error message", async () => {
    stubFetch({ ok: false, json: { error: "Caretaker is bound to another owner" } });
    const { result } = renderHook(() => useUpdateCaretakerPrivileges());

    let rejection: unknown;
    await act(async () => {
      rejection = await result.current
        .updatePrivileges("care-1", ["manage_tenants"])
        .catch((err: unknown) => err);
    });
    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toBe("Caretaker is bound to another owner");
    expect(result.current.error).toBe("Caretaker is bound to another owner");
  });
});
