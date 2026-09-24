"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DashboardDocument } from "@/types/communications";

/**
 * Fetches the tenant document metadata list (`limit=100`). Downloads stay a
 * client-side mock (metadata rows carry no content) — the page reads the
 * denormalized `name`/`size`/`uploadedBy` fields unchanged.
 */
export function useDocuments() {
  const [items, setItems] = useState<DashboardDocument[]>([]);
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
        const res = await fetch(`/api/v1/documents${query}`);
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setItems(json.data ?? []);
          setError(null);
        } else {
          setError(json.error || "Failed to fetch documents");
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
