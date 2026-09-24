import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationsBell } from "@/components/NotificationsBell";
import type { AppNotification } from "@/types/notifications";

const unread: AppNotification = {
  _id: "notif-1",
  recipientUserId: "user-1",
  recipientRole: "tenant",
  type: "invoice:paid",
  title: "Payment received",
  body: "Your September rent was received.",
  data: { invoiceId: "inv-1" },
  link: "/dashboard/tenant/payments",
  channels: ["in-app"],
  readAt: null,
  emailSentAt: null,
  createdAt: "2026-09-24T10:00:00.000Z",
  updatedAt: "2026-09-24T10:00:00.000Z",
};

const second: AppNotification = {
  ...unread,
  _id: "notif-2",
  type: "complaint:status-changed",
  title: "Complaint resolved",
  body: "Your complaint was marked resolved.",
  data: { complaintId: "comp-1" },
  link: "/dashboard/tenant/complaints",
};

function jsonReply(json: unknown) {
  return { ok: true, status: 200, json: vi.fn().mockResolvedValue(json) };
}

function stubFetch() {
  const calls: string[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url}`);
    if (method === "PATCH") {
      return Promise.resolve(jsonReply({ data: { ...unread, readAt: new Date().toISOString() } }));
    }
    if (method === "POST") {
      return Promise.resolve(jsonReply({ data: { modifiedCount: 2 } }));
    }
    if (url.includes("/unread-count")) {
      return Promise.resolve(jsonReply({ data: { count: 2 } }));
    }
    return Promise.resolve(jsonReply({ data: [unread, second] }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

describe("NotificationsBell", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the bell and shows the unread count badge", async () => {
    const { fetchMock } = stubFetch();
    render(<NotificationsBell />);

    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Notifications/ })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/notifications/unread-count");
  });

  it("opens the panel and lists unread notifications", async () => {
    const { fetchMock } = stubFetch();
    render(<NotificationsBell />);
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));

    await waitFor(() => expect(screen.getByText("Payment received")).toBeInTheDocument());
    expect(screen.getByText("Complaint resolved")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/notifications?limit=20&unread=true");
  });

  it("marks a notification read before navigating away", async () => {
    const { fetchMock } = stubFetch();
    render(<NotificationsBell />);
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    await waitFor(() => expect(screen.getByText("Payment received")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Payment received"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/notifications/notif-1", {
        method: "PATCH",
      }),
    );
  });

  it("marks all notifications read and refetches the panel", async () => {
    const { fetchMock } = stubFetch();
    render(<NotificationsBell />);
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    await waitFor(() => expect(screen.getByText("Payment received")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Mark all read/ }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/notifications/mark-all-read", {
        method: "POST",
      }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/notifications?limit=20&unread=true"),
    );
  });

  it("closes the panel on Escape", async () => {
    stubFetch();
    render(<NotificationsBell />);
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    await waitFor(() => expect(screen.getByText("Payment received")).toBeInTheDocument());

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByText("Payment received")).not.toBeInTheDocument());
  });
});
