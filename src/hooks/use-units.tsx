"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { UnitStatus } from "@/lib/domain-enums";

export type { UnitStatus };

export interface Unit {
  _id: string;
  propertyId: string;
  ownerId: string;
  blockId: string;
  blockName: string;
  floorId: string;
  floorLevel: number;
  floorLabel: string;
  name: string;
  letter: string;
  status: UnitStatus;
  rent: number | null;
  beds: number;
  baths: number;
  area: number;
  tenantId: string;
}

export interface UnitFilters {
  propertyId?: string;
  blockId?: string;
  status?: UnitStatus;
  tenantId?: string;
}

export interface UnitInput {
  status?: UnitStatus;
  rent?: number | null;
  beds?: number;
  baths?: number;
  area?: number;
  name?: string;
  tenantId?: string;
}

export function useUnits(filters?: UnitFilters) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters?.propertyId) params.set("propertyId", filters.propertyId);
    if (filters?.blockId) params.set("blockId", filters.blockId);
    if (filters?.status) params.set("status", filters.status);
    if (filters?.tenantId) params.set("tenantId", filters.tenantId);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [filters?.propertyId, filters?.blockId, filters?.status, filters?.tenantId]);

  useEffect(() => {
    let cancelled = false;
    void reload;
    const fetchUnits = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/units${query}`);
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setUnits(json.data);
          setError(null);
        } else {
          setError(json.error || "Failed to fetch units");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchUnits();
    return () => {
      cancelled = true;
    };
  }, [query, reload]);

  useEffect(() => {
    const onFocus = () => setReload((n) => n + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const refetch = useCallback(() => setReload((n) => n + 1), []);

  return { units, loading, error, refetch };
}

export function useUnitMutations() {
  const [pending, setPending] = useState(false);

  const updateUnit = async (id: string, input: UnitInput): Promise<Unit> => {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/units/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update unit");
      return json.data as Unit;
    } finally {
      setPending(false);
    }
  };

  const deleteUnit = async (id: string): Promise<void> => {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/units/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete unit");
    } finally {
      setPending(false);
    }
  };

  return { updateUnit, deleteUnit, pending };
}
