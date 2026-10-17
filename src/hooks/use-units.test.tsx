import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Unit } from "@/hooks/use-units";
import { useUnits } from "@/hooks/use-units";

const unit = (id: string): Unit => ({
  _id: id,
  propertyId: "prop-1",
  ownerId: "owner-1",
  blockId: "b1",
  blockName: "Block A",
  floorId: "f1",
  floorLevel: 0,
  floorLabel: "Ground",
  name: id.toUpperCase(),
  letter: "A",
  status: "available",
  rent: null,
  beds: 0,
  baths: 0,
  area: 0,
  tenantId: "",
});

describe("useUnits", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads a single page by default and exposes the total", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [unit("a1")],
          pagination: { total: 7, page: 1, limit: 10, hasNextPage: true },
        }),
      }),
    );

    const { result } = renderHook(() => useUnits({ propertyId: "prop-1" }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.units).toEqual([unit("a1")]);
    expect(result.current.total).toBe(7);
    // No page/limit params are added in the default (single-page) mode.
    expect(fetch).toHaveBeenCalledWith("/api/v1/units?propertyId=prop-1");
  });

  it("pages through every result when fetchAll is set", async () => {
    const fetchMock = vi.fn((url: string) => {
      const page = Number(new URL(`http://x${url}`).searchParams.get("page") ?? "1");
      const data = page === 1 ? [unit("a1"), unit("a2")] : [unit("a3")];
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data,
          pagination: { total: 3, page, limit: 100, hasNextPage: page < 2 },
        }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useUnits({ propertyId: "prop-1" }, { fetchAll: true }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.units.map((u) => u._id)).toEqual(["a1", "a2", "a3"]);
    expect(result.current.total).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/units?propertyId=prop-1&page=1&limit=100",
    );
  });

  it("surfaces an API error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Forbidden" }) }),
    );

    const { result } = renderHook(() => useUnits());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Forbidden");
    expect(result.current.units).toEqual([]);
  });
});
