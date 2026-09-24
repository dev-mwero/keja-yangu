"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComplaintStatus } from "@/lib/domain-enums";
import type { Complaint } from "@/types/communications";

export interface ComplaintFilters {
  status?: ComplaintStatus;
}

/** Complaint creation payload accepted by `POST /api/v1/complaints`. */
export interface ComplaintInput {
  propertyId?: string;
  subject: string;
  category: Complaint["category"];
  message: string;
  priority: Complaint["priority"];
}

/** Complaint status update payload accepted by `PATCH /api/v1/complaints/[id]`. */
export interface ComplaintStatusInput {
  status?: ComplaintStatus;
  resolution?: string;
}

/**
 * Fetches the complaint page list (`limit=100`) with an optional status filter.
 * The `refetch` counter callback re-runs the effect, mirroring the invoice hook.
 */
export function useComplaints(filters?: ComplaintFilters) {
  const [items, setItems] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: "100" });
    if (filters?.status) params.set("status", filters.status);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [filters?.status]);

  useEffect(() => {
    let cancelled = false;
    void reload;
    const fetchItems = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/complaints${query}`);
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setItems(json.data ?? []);
          setError(null);
        } else {
          setError(json.error || "Failed to fetch complaints");
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

/** Complaint mutations: create (tenant) and status update (staff). */
export function useComplaintMutations() {
  const [pending, setPending] = useState(false);

  const createComplaint = async (input: ComplaintInput): Promise<Complaint> => {
    setPending(true);
    try {
      const res = await fetch("/api/v1/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to submit complaint");
      }
      return json.data as Complaint;
    } finally {
      setPending(false);
    }
  };

  const updateStatus = async (id: string, input: ComplaintStatusInput = {}): Promise<Complaint> => {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/complaints/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to update complaint");
      }
      return json.data as Complaint;
    } finally {
      setPending(false);
    }
  };

  return { createComplaint, updateStatus, pending };
}
