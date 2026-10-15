"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/** One rent period's collection totals, as returned in `AmountSummary.byPeriod`. */
export interface AmountPeriodSummary {
  period: string;
  billed: number;
  collected: number;
  open: number;
  count: number;
}

/** Response payload of `GET /api/v1/amounts`. */
export interface AmountSummary {
  potentialMonthlyRent: number;
  occupiedMonthlyRent: number;
  contractedRent: number;
  rentBilled: number;
  rentCollected: number;
  rentOutstanding: number;
  openInvoiceCount: number;
  period: string;
  byPeriod: AmountPeriodSummary[];
  unitCount: number;
  invoiceCount: number;
  occupiedUnitCount: number;
}

export interface AmountsFilters {
  /** Restrict to one property. Ignored for callers outside that scope. */
  propertyId?: string;
  /** System-admins only; every other role is scoped to its own portfolio. */
  ownerId?: string;
  /** `"YYYY-MM"`; omit for the server's current period. */
  period?: string;
}

const EMPTY_SUMMARY: AmountSummary = {
  potentialMonthlyRent: 0,
  occupiedMonthlyRent: 0,
  contractedRent: 0,
  rentBilled: 0,
  rentCollected: 0,
  rentOutstanding: 0,
  openInvoiceCount: 0,
  period: "",
  byPeriod: [],
  unitCount: 0,
  invoiceCount: 0,
  occupiedUnitCount: 0,
};

/**
 * Fetches the rent potential, occupied rent, and period collection rollup.
 * The server derives the portfolio from the session, so `ownerId` is only
 * meaningful for a system-admin impersonating a specific owner.
 */
export function useAmounts(filters?: AmountsFilters) {
  const [amounts, setAmounts] = useState<AmountSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters?.propertyId) params.set("propertyId", filters.propertyId);
    if (filters?.ownerId) params.set("ownerId", filters.ownerId);
    if (filters?.period) params.set("period", filters.period);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [filters?.ownerId, filters?.period, filters?.propertyId]);

  useEffect(() => {
    let cancelled = false;
    void reload;
    const fetchAmounts = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/amounts${query}`);
        const json = (await res.json()) as Partial<AmountSummary> & { error?: string };
        if (cancelled) return;
        if (res.ok && typeof json.potentialMonthlyRent === "number") {
          setAmounts(json as AmountSummary);
          setError(null);
        } else {
          setError(json.error ?? "Failed to fetch amounts");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchAmounts();
    return () => {
      cancelled = true;
    };
  }, [query, reload]);

  const refetch = useCallback(() => setReload((n) => n + 1), []);

  return { amounts, loading, error, refetch };
}
