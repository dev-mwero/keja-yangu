"use client";

import { useCallback, useEffect, useState } from "react";
import type { PropertyTypeOption } from "@/lib/property-types";

export function usePropertyTypes(options?: { all?: boolean }) {
  const all = options?.all ?? false;
  const [types, setTypes] = useState<PropertyTypeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `reload` is a manual refetch trigger.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/v1/property-types${all ? "?all=1" : ""}`)
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setTypes(json.data ?? []);
          setError(null);
        } else {
          setError(json.error || "Failed to load property types");
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
  }, [all, reload]);

  const refetch = useCallback(() => setReload((n) => n + 1), []);

  return { types, loading, error, refetch };
}

export function usePropertyTypeMutations() {
  const [pending, setPending] = useState(false);

  const createType = useCallback(async (label: string): Promise<PropertyTypeOption> => {
    setPending(true);
    try {
      const res = await fetch("/api/v1/property-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create property type");
      return json.data as PropertyTypeOption;
    } finally {
      setPending(false);
    }
  }, []);

  const updateType = useCallback(
    async (
      id: string,
      patch: { label?: string; active?: boolean; order?: number },
    ): Promise<PropertyTypeOption> => {
      setPending(true);
      try {
        const res = await fetch(`/api/v1/property-types/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to update property type");
        return json.data as PropertyTypeOption;
      } finally {
        setPending(false);
      }
    },
    [],
  );

  return { createType, updateType, pending };
}
