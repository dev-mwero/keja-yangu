import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useRecycleBinCounts,
  useRecycleBinMutations,
  useRecycleBinRecords,
} from "@/hooks/use-recycle-bin";

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

describe("useRecycleBinCounts", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("loads per-type counts, filling missing types with zero", async () => {
    stubFetch({ json: { data: { property: 2, invoice: 5 } } });
    const { result } = renderHook(() => useRecycleBinCounts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.counts).toEqual({
      property: 2,
      unit: 0,
      tenant: 0,
      lease: 0,
      invoice: 5,
      propertytype: 0,
    });
    expect(fetch).toHaveBeenCalledWith("/api/v1/recycle-bin");
  });

  it("surfaces an API error", async () => {
    stubFetch({ ok: false, json: { error: "Forbidden" } });
    const { result } = renderHook(() => useRecycleBinCounts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Forbidden");
  });
});

describe("useRecycleBinRecords", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("requests a type page and exposes records + pagination", async () => {
    const pagination = {
      page: 2,
      limit: 10,
      total: 11,
      totalPages: 2,
      hasNextPage: false,
      hasPrevPage: true,
    };
    stubFetch({ json: { data: [{ _id: "p1" }], pagination } });

    const { result } = renderHook(() => useRecycleBinRecords("property", 2, 10));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetch).toHaveBeenCalledWith("/api/v1/recycle-bin?type=property&page=2&limit=10");
    expect(result.current.records).toEqual([{ _id: "p1" }]);
    expect(result.current.pagination).toEqual(pagination);
  });
});

describe("useRecycleBinMutations", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs to the restore endpoint", async () => {
    stubFetch({ json: { data: { type: "tenant", _id: "t1" } } });
    const { result } = renderHook(() => useRecycleBinMutations());

    await act(async () => {
      await result.current.restore("tenant", "t1");
    });

    expect(fetch).toHaveBeenCalledWith("/api/v1/recycle-bin/tenant/t1/restore", {
      method: "POST",
    });
    expect(result.current.pendingId).toBeNull();
  });

  it("DELETEs to the purge endpoint", async () => {
    stubFetch({ json: { data: { purged: true } } });
    const { result } = renderHook(() => useRecycleBinMutations());

    await act(async () => {
      await result.current.purge("invoice", "i9");
    });

    expect(fetch).toHaveBeenCalledWith("/api/v1/recycle-bin/invoice/i9", { method: "DELETE" });
  });

  it("throws the API error message on failure", async () => {
    stubFetch({ ok: false, json: { error: "Deleted record not found" } });
    const { result } = renderHook(() => useRecycleBinMutations());

    let rejection: unknown;
    await act(async () => {
      rejection = await result.current.restore("tenant", "gone").catch((err: unknown) => err);
    });

    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toBe("Deleted record not found");
    expect(result.current.pendingId).toBeNull();
  });
});
