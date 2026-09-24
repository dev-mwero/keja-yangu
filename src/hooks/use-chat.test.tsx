import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatMutations, useChatThreads, useThreadMessages } from "@/hooks/use-chat";
import type { ChatMessage, ChatThread } from "@/types/communications";

const thread: ChatThread = {
  _id: "thread-1",
  tenantId: "tenant-1",
  propertyId: "prop-1",
  ownerId: "owner-1",
  agentUserId: "agent-1",
  agentRole: "caretaker",
  contact: "John Kiprono",
  role: "Caretaker",
  property: "Sunlit Studio in Kilimani",
  lastAt: "2026-09-02T09:00:00.000Z",
  lastMessageText: "Water tanks Thursday.",
  unread: 2,
};

const message: ChatMessage = {
  _id: "msg-1",
  threadId: "thread-1",
  senderUserId: "user-1",
  senderRole: "tenant",
  sender: "me",
  text: "Anytime.",
  at: "2026-09-02T09:30:00.000Z",
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

const flush = () =>
  act(async () => {
    await Promise.resolve();
  });

describe("useChatThreads", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("loads threads from GET /api/v1/chat/threads?limit=100", async () => {
    stubFetch({ json: { data: [thread] } });
    const { result } = renderHook(() => useChatThreads());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([thread]);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/v1/chat/threads?limit=100");
  });

  it("polls again after the interval", async () => {
    vi.useFakeTimers();
    stubFetch({ json: { data: [] } });
    const { result } = renderHook(() => useChatThreads());
    await flush();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    expect(result.current.items).toEqual([]);
  });

  it("markThreadRead zeroes the badge locally", async () => {
    stubFetch({ json: { data: [thread] } });
    const { result } = renderHook(() => useChatThreads());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.markThreadRead("thread-1"));
    expect(result.current.items[0].unread).toBe(0);
  });
});

describe("useThreadMessages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("fetches messages for the selected thread and appends locally", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: [message] }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useThreadMessages("thread-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.messages).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/chat/threads/thread-1/messages?limit=100");

    act(() => result.current.appendMessage(message));
    expect(result.current.messages).toEqual([message]);
  });

  it("without a thread id it stays idle", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useThreadMessages(null));
    await flush();
    expect(result.current.messages).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("useChatMutations", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sendMessage POSTs and returns the message", async () => {
    stubFetch({ json: { data: message } });
    const { result } = renderHook(() => useChatMutations());

    let out: ChatMessage | undefined;
    await act(async () => {
      out = await result.current.sendMessage("thread-1", "Anytime.");
    });
    expect(out).toEqual(message);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/v1/chat/threads/thread-1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Anytime." }),
    });
  });

  it("openThread POSTs the read ack without throwing on failure", async () => {
    stubFetch({ ok: false, json: { error: "Thread not found" } });
    const { result } = renderHook(() => useChatMutations());

    await act(async () => {
      await result.current.openThread("thread-1");
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/v1/chat/threads/thread-1/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  });

  it("startThread POSTs and returns the thread", async () => {
    stubFetch({ json: { data: thread } });
    const { result } = renderHook(() => useChatMutations());

    let out: ChatThread | undefined;
    await act(async () => {
      out = await result.current.startThread("owner-1", "owner", "prop-1");
    });
    expect(out).toEqual(thread);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/v1/chat/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientId: "owner-1", role: "owner", propertyId: "prop-1" }),
    });
  });

  it("sendMessage throws the API error on a non-ok response", async () => {
    stubFetch({ ok: false, json: { error: "Thread not found" } });
    const { result } = renderHook(() => useChatMutations());

    let rejection: unknown;
    await act(async () => {
      rejection = await result.current.sendMessage("missing", "hi").catch((err: unknown) => err);
    });
    expect((rejection as Error).message).toBe("Thread not found");
  });
});
