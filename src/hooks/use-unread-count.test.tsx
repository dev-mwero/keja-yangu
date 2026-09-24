import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUnreadCount } from "@/hooks/use-unread-count";

function stubFetch(json: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: vi.fn().mockResolvedValue(json) }),
  );
}

const flush = () =>
  act(async () => {
    await Promise.resolve();
  });

describe("useUnreadCount", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("loads the unread count from GET /api/v1/notifications/unread-count", async () => {
    stubFetch({ data: { count: 4 } });
    const { result } = renderHook(() => useUnreadCount());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.count).toBe(4);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/v1/notifications/unread-count");
  });

  it("defaults to 0 and stops loading when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    const { result } = renderHook(() => useUnreadCount());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.count).toBe(0);
  });

  it("polls for a fresh count every 30s while visible", async () => {
    vi.useFakeTimers();
    stubFetch({ data: { count: 1 } });
    const { result } = renderHook(() => useUnreadCount());
    await flush();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    expect(result.current.count).toBe(1);
  });

  it("refetches immediately when the tab becomes visible again", async () => {
    stubFetch({ data: { count: 2 } });
    const { result } = renderHook(() => useUnreadCount());
    await waitFor(() => expect(result.current.loading).toBe(false));

    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    expect(result.current.count).toBe(2);
  });
});
