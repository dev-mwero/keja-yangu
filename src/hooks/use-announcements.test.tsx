import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAnnouncementMutations, useAnnouncements } from "@/hooks/use-announcements";
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

describe("useAnnouncementMutations", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("createAnnouncement POSTs the payload and returns the created row", async () => {
    stubFetch({ data: announcement });
    const { result } = renderHook(() => useAnnouncementMutations());

    let out: Announcement | undefined;
    await act(async () => {
      out = await result.current.createAnnouncement({
        title: "Water tank cleaning",
        body: "Thursday morning.",
        audience: "tenants",
        pinned: true,
      });
    });

    expect(out).toEqual(announcement);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/v1/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Water tank cleaning",
        body: "Thursday morning.",
        audience: "tenants",
        pinned: true,
      }),
    });
  });

  it("createAnnouncement throws the API error on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({ error: "Invalid announcement payload" }),
      }),
    );
    const { result } = renderHook(() => useAnnouncementMutations());

    let rejection: unknown;
    await act(async () => {
      rejection = await result.current
        .createAnnouncement({ title: "", body: "", audience: "tenants", pinned: false })
        .catch((err: unknown) => err);
    });
    expect((rejection as Error).message).toBe("Invalid announcement payload");
  });

  it("deleteAnnouncement DELETEs the id", async () => {
    stubFetch({ data: { _id: "ann-1" } });
    const { result } = renderHook(() => useAnnouncementMutations());

    await act(async () => {
      await result.current.deleteAnnouncement("ann-1");
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/v1/announcements/ann-1", {
      method: "DELETE",
    });
  });

  it("deleteAnnouncement throws the API error on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: vi.fn().mockResolvedValue({ error: "Forbidden" }),
      }),
    );
    const { result } = renderHook(() => useAnnouncementMutations());

    let rejection: unknown;
    await act(async () => {
      rejection = await result.current.deleteAnnouncement("ann-1").catch((err: unknown) => err);
    });
    expect((rejection as Error).message).toBe("Forbidden");
  });
});
