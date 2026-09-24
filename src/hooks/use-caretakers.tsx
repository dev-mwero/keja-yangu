"use client";

import { useCallback, useEffect, useState } from "react";

export interface CaretakerRow {
  id: string;
  name: string;
  email: string;
  managedByOwnerId: string;
  privileges: string[];
  propertyCount: number;
}

export function useCaretakers() {
  const [caretakers, setCaretakers] = useState<CaretakerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void reload;
    const fetchCaretakers = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/v1/caretakers");
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setCaretakers(json.data);
          setError(null);
        } else {
          setError(json.error || "Failed to fetch caretakers");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchCaretakers();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const refetch = useCallback(() => setReload((n) => n + 1), []);

  return { caretakers, loading, error, refetch };
}

export function useUpdateCaretakerPrivileges() {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updatePrivileges = async (id: string, privileges: string[]): Promise<CaretakerRow> => {
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/caretakers/${id}/privileges`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privileges }),
      });
      const json = await res.json();
      if (!res.ok) {
        const message = json.error || "Failed to update privileges";
        setError(message);
        throw new Error(message);
      }
      return json.data as CaretakerRow;
    } finally {
      setPendingId(null);
    }
  };

  return { updatePrivileges, pendingId, error };
}
