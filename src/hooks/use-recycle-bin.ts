"use client";

import { useCallback, useEffect, useState } from "react";
import { RECYCLE_BIN_TYPES, type RecycleBinType } from "@/lib/recycle-bin-types";

export interface RecycleBinRecord {
  _id: string;
  deletedAt?: string | null;
  [key: string]: unknown;
}

export interface RecycleBinPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export type RecycleBinCounts = Record<RecycleBinType, number>;

function emptyCounts(): RecycleBinCounts {
  return Object.fromEntries(RECYCLE_BIN_TYPES.map((type) => [type, 0])) as RecycleBinCounts;
}

/** Soft-deleted counts per type, for the recycle-bin overview. */
export function useRecycleBinCounts() {
  const [counts, setCounts] = useState<RecycleBinCounts>(emptyCounts);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `reload` is a manual refetch trigger.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/v1/recycle-bin")
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setCounts({ ...emptyCounts(), ...(json.data ?? {}) });
          setError(null);
        } else {
          setError(json.error || "Failed to load recycle bin");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const refetch = useCallback(() => setReload((n) => n + 1), []);
  return { counts, loading, error, refetch };
}

/** A page of soft-deleted records of one type. */
export function useRecycleBinRecords(type: RecycleBinType, page: number, limit = 20) {
  const [records, setRecords] = useState<RecycleBinRecord[]>([]);
  const [pagination, setPagination] = useState<RecycleBinPagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `reload` is a manual refetch trigger.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/v1/recycle-bin?type=${type}&page=${page}&limit=${limit}`)
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setRecords((json.data as RecycleBinRecord[]) ?? []);
          setPagination((json.pagination as RecycleBinPagination) ?? null);
          setError(null);
        } else {
          setError(json.error || "Failed to load records");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [type, page, limit, reload]);

  const refetch = useCallback(() => setReload((n) => n + 1), []);
  return { records, pagination, loading, error, refetch };
}

/** Restore / purge actions. `pendingId` is the record currently in flight. */
export function useRecycleBinMutations() {
  const [pendingId, setPendingId] = useState<string | null>(null);

  const withPending = useCallback(async <T>(id: string, action: () => Promise<T>): Promise<T> => {
    setPendingId(id);
    try {
      return await action();
    } finally {
      setPendingId(null);
    }
  }, []);

  const restore = useCallback(
    (type: RecycleBinType, id: string) =>
      withPending(id, async () => {
        const res = await fetch(`/api/v1/recycle-bin/${type}/${id}/restore`, { method: "POST" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to restore record");
        return json.data;
      }),
    [withPending],
  );

  const purge = useCallback(
    (type: RecycleBinType, id: string) =>
      withPending(id, async () => {
        const res = await fetch(`/api/v1/recycle-bin/${type}/${id}`, { method: "DELETE" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to delete record");
        return json.data;
      }),
    [withPending],
  );

  return { restore, purge, pendingId };
}
