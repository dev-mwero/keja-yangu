"use client";

import { useCallback, useEffect, useState } from "react";

export interface MyTenancy {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  propertyId: string;
  ownerId: string;
  status: "active" | "pending" | "rejected";
  userId?: string;
  joinedAt?: string;
  notes?: string;
}

/** Fetches the signed-in tenant's tenancy rows (`GET /api/v1/tenant/me`). */
export function useMyTenancy() {
  const [tenancies, setTenancies] = useState<MyTenancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void reload;
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/v1/tenant/me");
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          const rows = Array.isArray(json.data)
            ? (json.data as MyTenancy[])
            : json.data
              ? [json.data as MyTenancy]
              : [];
          setTenancies(rows);
          setError(null);
        } else {
          setTenancies([]);
          // A tenant with no tenancy row is a valid (empty) state, not an error.
          setError(res.status === 404 ? null : json.error || "Failed to fetch tenancy");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const refetch = useCallback(() => setReload((n) => n + 1), []);
  const tenancy = tenancies[0] ?? null;
  return { tenancy, tenancies, loading, error, refetch };
}
