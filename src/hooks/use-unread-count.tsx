"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 30_000;

/**
 * Polls the unread notification count every 30s while the tab is visible.
 * The interval early-returns for hidden tabs and a `visibilitychange` listener
 * refetches immediately when the tab becomes visible again.
 */
export function useUnreadCount() {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const visibleRef = useRef(typeof document === "undefined" ? true : !document.hidden);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/notifications/unread-count");
      const json = await res.json();
      if (res.ok) {
        setCount((json.data?.count ?? 0) as number);
      }
    } catch {
      // Best-effort polling — keep the last known count on network hiccups.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onVisibilityChange = () => {
      visibleRef.current = !document.hidden;
      if (visibleRef.current) void fetchCount();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const interval = window.setInterval(() => {
      if (visibleRef.current) void fetchCount();
    }, POLL_INTERVAL_MS);
    void fetchCount();
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(interval);
    };
  }, [fetchCount]);

  return { count, loading };
}
