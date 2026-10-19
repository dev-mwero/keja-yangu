"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Announcement } from "@/types/communications";

/**
 * Fetches the tenant announcement list (`limit=100`). The page keeps its own
 * client-side pinned/date sort for deterministic rendering; the server sorts
 * pinned-first as a fallback for raw consumers.
 */
export function useAnnouncements() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const query = useMemo(() => "?limit=100", []);

  useEffect(() => {
    let cancelled = false;
    void reload;
    const fetchItems = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/announcements${query}`);
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setItems(json.data ?? []);
          setError(null);
        } else {
          setError(json.error || "Failed to fetch announcements");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchItems();
    return () => {
      cancelled = true;
    };
  }, [query, reload]);

  const refetch = useCallback(() => setReload((n) => n + 1), []);

  return { items, loading, error, refetch };
}

export interface AnnouncementInput {
  title: string;
  body: string;
  audience: Announcement["audience"];
  pinned: boolean;
  /** Empty string (or omitted) posts portfolio-wide. */
  propertyId?: string;
}

/** Announcement mutations for the staff Communications pages. */
export function useAnnouncementMutations() {
  const [pending, setPending] = useState(false);

  const createAnnouncement = async (input: AnnouncementInput): Promise<Announcement> => {
    setPending(true);
    try {
      const res = await fetch("/api/v1/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to publish announcement");
      }
      return json.data as Announcement;
    } finally {
      setPending(false);
    }
  };

  const deleteAnnouncement = async (id: string): Promise<void> => {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/announcements/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to delete announcement");
      }
    } finally {
      setPending(false);
    }
  };

  return { createAnnouncement, deleteAnnouncement, pending };
}
