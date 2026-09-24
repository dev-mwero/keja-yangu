import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAnnouncements } from "@/hooks/use-announcements";
import type { Announcement } from "@/types/communications";

const announcement: Announcement = {
  _id: "ann-1",
  title: "Water tank cleaning — Thursday morning",
  body: "Water tanks will be cleaned this Thursday from 7:00 AM to 11:00 AM.",
  authorId: "user-1",
  authorName: "John Kiprono",
  author: "John Kiprono",
  ownerId: "owner-1",
  propertyId: "",
  property: "All properties",
  pinned: true,
  audience: "tenants",
  createdAt: "2026-09-02T08:00:00.000Z",
  updatedAt: "2026-09-02T08:00:00.000Z",
};

function stubFetch(json: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: vi.fn().mockResolvedValue(json) }),
  );
}

describe("useAnnouncements", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads announcements from GET /api/v1/announcements?limit=100", async () => {
    stubFetch({ data: [announcement] });
    const { result } = renderHook(() => useAnnouncements());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([announcement]);
    expect(result.current.error).toBeNull();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/v1/announcements?limit=100");
  });

  it("surfaces a non-ok response error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: vi.fn().mockResolvedValue({ error: "Forbidden" }),
      }),
    );
    const { result } = renderHook(() => useAnnouncements());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Forbidden");
    expect(result.current.items).toEqual([]);
  });
});
