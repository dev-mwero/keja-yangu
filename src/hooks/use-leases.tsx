"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LeaseInput, LeaseUpdate } from "@/lib/schemas";
import type { Lease } from "@/types/invoicing";

export type LeaseStatus = "active" | "ended";

export interface LeaseFilters {
  status?: LeaseStatus;
  tenantId?: string;
  propertyId?: string;
}

export function useLeases(filters?: LeaseFilters) {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: "100" });
    if (filters?.status) params.set("status", filters.status);
    if (filters?.tenantId) params.set("tenantId", filters.tenantId);
    if (filters?.propertyId) params.set("propertyId", filters.propertyId);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [filters?.status, filters?.tenantId, filters?.propertyId]);

  useEffect(() => {
    let cancelled = false;
    void reload;
    const fetchLeases = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/leases${query}`);
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setLeases(json.data);
          setError(null);
        } else {
          setError(json.error || "Failed to fetch leases");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchLeases();
    return () => {
      cancelled = true;
    };
  }, [query, reload]);

  const refetch = useCallback(() => setReload((n) => n + 1), []);

  return { leases, loading, error, refetch };
}

export function useLeaseMutations() {
  const [pending, setPending] = useState(false);

  const createLease = async (input: LeaseInput): Promise<Lease> => {
    setPending(true);
    try {
      const res = await fetch("/api/v1/leases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to create lease");
      }
      return json.data as Lease;
    } finally {
      setPending(false);
    }
  };

  const updateLease = async (id: string, input: Partial<LeaseUpdate>): Promise<Lease> => {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/leases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to update lease");
      }
      return json.data as Lease;
    } finally {
      setPending(false);
    }
  };

  const deleteLease = async (id: string): Promise<void> => {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/leases/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to delete lease");
      }
    } finally {
      setPending(false);
    }
  };

  return { createLease, updateLease, deleteLease, pending };
}
