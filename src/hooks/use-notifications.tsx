"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppNotification } from "@/types/notifications";

export interface NotificationFilters {
  unread?: boolean;
  type?: string;
}

export function useNotifications(filters?: NotificationFilters) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: "20" });
    if (filters?.unread) params.set("unread", "true");
    if (filters?.type) params.set("type", filters.type);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [filters?.type, filters?.unread]);

  useEffect(() => {
    let cancelled = false;
    void reload;
    const fetchNotifications = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/notifications${query}`);
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setNotifications(json.data);
          setError(null);
        } else {
          setError(json.error || "Failed to fetch notifications");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchNotifications();
    return () => {
      cancelled = true;
    };
  }, [query, reload]);

  const refetch = useCallback(() => setReload((n) => n + 1), []);

  return { notifications, loading, error, refetch };
}

export function useNotificationMutations() {
  const [pending, setPending] = useState(false);

  const markRead = async (id: string): Promise<AppNotification> => {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/notifications/${id}`, { method: "PATCH" });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to mark notification read");
      }
      return json.data as AppNotification;
    } finally {
      setPending(false);
    }
  };

  const markAllRead = async (): Promise<number> => {
    setPending(true);
    try {
      const res = await fetch("/api/v1/notifications/mark-all-read", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to clear notifications");
      }
      return (json.data?.modifiedCount ?? 0) as number;
    } finally {
      setPending(false);
    }
  };

  return { markRead, markAllRead, pending };
}
