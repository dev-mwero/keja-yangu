"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, ChatThread } from "@/types/communications";

const DEFAULT_POLL_MS = 10_000;

/**
 * Polls the chat thread list every 10s while the tab is visible. The interval
 * skips hidden tabs (mirroring `useUnreadCount`) and refetches on visibility.
 * `markThreadRead` zeroes a thread's badge locally — the server read is acked
 * by `useChatMutations.openThread` and the next poll returns the persisted
 * state.
 */
export function useChatThreads(pollMs?: number) {
  const intervalMs = pollMs ?? DEFAULT_POLL_MS;
  const [items, setItems] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const inFlightRef = useRef(false);
  const visibleRef = useRef(typeof document === "undefined" ? true : !document.hidden);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetchThreads is intentionally left out of the deps (unstable identity); reload bumps it on demand.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onVisibilityChange = () => {
      visibleRef.current = !document.hidden;
      if (visibleRef.current) {
        void fetchThreads();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const interval = window.setInterval(() => {
      if (visibleRef.current) void fetchThreads();
    }, intervalMs);
    void fetchThreads();
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(interval);
    };
  }, [intervalMs, reload]);

  const fetchThreads = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading((prev) => prev || items.length === 0);
    try {
      const res = await fetch("/api/v1/chat/threads?limit=100");
      const json = await res.json();
      if (res.ok) {
        setItems(json.data ?? []);
        setError(null);
      } else {
        setError(json.error || "Failed to fetch conversations");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [items.length]);

  const markThreadRead = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((thread) => (thread._id === id ? { ...thread, unread: 0 } : thread)),
    );
  }, []);

  /** Local echo of a sent message so the sidebar preview updates immediately. */
  const bumpThread = useCallback(
    (id: string, patch: { lastAt: string; lastMessageText: string }) => {
      setItems((prev) =>
        prev.map((thread) => (thread._id === id ? { ...thread, ...patch } : thread)),
      );
    },
    [],
  );

  const refetch = useCallback(() => setReload((n) => n + 1), []);

  return { items, loading, error, refetch, markThreadRead, bumpThread };
}

/**
 * Fetches the message history of the selected thread (`null` disables the
 * fetch) and polls while the thread stays open. `appendMessage` is used for
 * local echo after sending so the UI updates before the next poll.
 */
export function useThreadMessages(threadId: string | null, pollMs?: number) {
  const intervalMs = pollMs ?? DEFAULT_POLL_MS;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const visibleRef = useRef(typeof document === "undefined" ? true : !document.hidden);

  useEffect(() => {
    if (!threadId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    if (typeof window === "undefined") return;

    const fetchMessages = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/chat/threads/${threadId}/messages?limit=100`);
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setMessages(json.data ?? []);
          setError(null);
        } else {
          setError(json.error || "Failed to fetch messages");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
      } finally {
        inFlightRef.current = false;
        if (!cancelled) setLoading(false);
      }
    };

    const onVisibilityChange = () => {
      visibleRef.current = !document.hidden;
      if (visibleRef.current) void fetchMessages();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const interval = window.setInterval(() => {
      if (visibleRef.current) void fetchMessages();
    }, intervalMs);
    void fetchMessages();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(interval);
    };
  }, [threadId, intervalMs]);

  const appendMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  return { messages, loading, error, appendMessage };
}

/** Chat mutations: sending, marking a thread read, and starting a thread. */
export function useChatMutations() {
  const [pending, setPending] = useState(false);

  const sendMessage = async (threadId: string, text: string): Promise<ChatMessage> => {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/chat/threads/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to send message");
      }
      return json.data as ChatMessage;
    } finally {
      setPending(false);
    }
  };

  /**
   * Marks a thread read on the server (idempotent). Best-effort: the sidebar
   * badge is zeroed optimistically by the page and the next poll reconciles.
   */
  const openThread = async (id: string): Promise<void> => {
    setPending(true);
    try {
      await fetch(`/api/v1/chat/threads/${id}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {
      // Best-effort read ack — polling reconciles the badge either way.
    } finally {
      setPending(false);
    }
  };

  const startThread = async (
    recipientId: string,
    role: "owner" | "caretaker",
    propertyId?: string,
  ): Promise<ChatThread> => {
    setPending(true);
    try {
      const res = await fetch("/api/v1/chat/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId, role, propertyId }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to start conversation");
      }
      return json.data as ChatThread;
    } finally {
      setPending(false);
    }
  };

  return { sendMessage, openThread, startThread, pending };
}
