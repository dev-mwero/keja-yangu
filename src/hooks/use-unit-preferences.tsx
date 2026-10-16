"use client";

import { useCallback, useEffect, useState } from "react";

export interface UnitPreference {
  _id: string;
  userId: string;
  propertyId: string;
  ownerId: string;
  unitId: string;
  blockId: string;
  blockName: string;
  floorId: string;
  floorLabel: string;
  note: string;
}

/** The signed-in tenant's live unit preferences. */
export function useUnitPreferences() {
  const [preferences, setPreferences] = useState<UnitPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void reload;
    const fetchPreferences = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/v1/tenant/unit-preferences");
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setPreferences(json.data);
          setError(null);
        } else {
          setError(json.error || "Failed to fetch preferences");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchPreferences();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const refetch = useCallback(() => setReload((n) => n + 1), []);

  return { preferences, loading, error, refetch };
}

export function useUnitPreferenceMutations() {
  const [pending, setPending] = useState(false);

  const preferUnit = async (unitId: string, note?: string): Promise<UnitPreference> => {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/units/${unitId}/prefer`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save preference");
      return json.data as UnitPreference;
    } finally {
      setPending(false);
    }
  };

  const clearPreference = async (unitId: string): Promise<void> => {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/units/${unitId}/prefer`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to clear preference");
    } finally {
      setPending(false);
    }
  };

  return { preferUnit, clearPreference, pending };
}
