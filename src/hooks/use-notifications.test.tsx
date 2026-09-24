import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNotificationMutations, useNotifications } from "@/hooks/use-notifications";
import type { AppNotification } from "@/types/notifications";

const notification: AppNotification = {
  _id: "notif-1",
  recipientUserId: "user-1",
  recipientRole: "tenant",
  type: "invoice:paid",
  title: "Payment received",
  body: "Your August rent was received.",
  data: { invoiceId: "inv-1" },
  link: "/dashboard/tenant/payments",
  channels: ["in-app"],
  readAt: null,
  emailSentAt: null,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
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

describe("useNotifications", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads notifications from GET /api/v1/notifications?limit=20", async () => {
    stubFetch({ json: { data: [notification] } });
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notifications).toEqual([notification]);
    expect(result.current.error).toBeNull();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/v1/notifications?limit=20");
  });

  it("appends the unread and type filters to the query string", async () => {
    stubFetch({ json: { data: [] } });
    const { result } = renderHook(() => useNotifications({ unread: true, type: "invoice:paid" }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/v1/notifications?limit=20&unread=true&type=invoice%3Apaid",
    );
  });

  it("surfaces a non-ok response error", async () => {
    stubFetch({ ok: false, json: { error: "Forbidden" } });
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Forbidden");
    expect(result.current.notifications).toEqual([]);
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
      json: vi.fn().mockResolvedValue({ data: [notification] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => result.current.refetch());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.notifications).toEqual([notification]));
  });
});

describe("useNotificationMutations", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("markRead PATCHes the notification and returns the updated record", async () => {
    const read = { ...notification, readAt: "2026-09-01T11:00:00.000Z" };
    stubFetch({ json: { data: read } });
    const { result } = renderHook(() => useNotificationMutations());

    let out: AppNotification | undefined;
    await act(async () => {
      out = await result.current.markRead("notif-1");
    });
    expect(out).toEqual(read);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/v1/notifications/notif-1", {
      method: "PATCH",
    });
    expect(result.current.pending).toBe(false);
  });

  it("markRead throws the API error on a non-ok response", async () => {
    stubFetch({ ok: false, json: { error: "Notification not found" } });
    const { result } = renderHook(() => useNotificationMutations());

    let rejection: unknown;
    await act(async () => {
      rejection = await result.current.markRead("missing").catch((err: unknown) => err);
    });
    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toBe("Notification not found");
  });

  it("markAllRead POSTs and returns the modified count", async () => {
    stubFetch({ json: { data: { modifiedCount: 3 } } });
    const { result } = renderHook(() => useNotificationMutations());

    let count = -1;
    await act(async () => {
      count = await result.current.markAllRead();
    });
    expect(count).toBe(3);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/v1/notifications/mark-all-read", {
      method: "POST",
    });
  });
});
