"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PropertyPurpose, UnitStatus } from "@/lib/domain-enums";

export type { PropertyPurpose, UnitStatus };

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
  purpose?: PropertyPurpose | null;
  rent: number | null;
  beds: number;
  baths: number;
  area: number;
  tenantId: string[];
}

export interface UnitFilters {
  propertyId?: string;
  blockId?: string;
  status?: UnitStatus;
  tenantId?: string;
}

export interface UseUnitsOptions {
  /**
   * Page through `/api/v1/units` until every matching unit is loaded, instead
   * of the single default page (10). Bounded by MAX_FETCH_ALL_PAGES.
   */
  fetchAll?: boolean;
  /**
   * When false, skip fetching entirely (units stays empty). Useful for lazily
   * loading a picker only once its dialog is open.
   */
  enabled?: boolean;
}

const FETCH_ALL_PAGE_SIZE = 100;
// 100 * 25 = 2,500 — comfortably above MAX_UNITS_PER_PROPERTY (2,000).
const MAX_FETCH_ALL_PAGES = 25;

export interface UnitInput {
  status?: UnitStatus;
  purpose?: PropertyPurpose | null;
  rent?: number | null;
  beds?: number;
  baths?: number;
  area?: number;
  name?: string;
}

export function useUnits(filters?: UnitFilters, options?: UseUnitsOptions) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [reload, setReload] = useState(0);

  const fetchAll = options?.fetchAll ?? false;
  const enabled = options?.enabled ?? true;
  const propertyId = filters?.propertyId;
  const blockId = filters?.blockId;
  const status = filters?.status;
  const tenantId = filters?.tenantId;

  const params = useMemo(() => {
    const search = new URLSearchParams();
    if (propertyId) search.set("propertyId", propertyId);
    if (blockId) search.set("blockId", blockId);
    if (status) search.set("status", status);
    if (tenantId) search.set("tenantId", tenantId);
    return search;
  }, [propertyId, blockId, status, tenantId]);

  useEffect(() => {
    let cancelled = false;
    void reload;
    const fetchUnits = async () => {
      if (!enabled) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        if (fetchAll) {
          // First page discovers the total; remaining pages are fetched in
          // parallel chunks so large portfolios don't pay a serial waterfall.
          const pageUrl = (page: number) => {
            const search = new URLSearchParams(params);
            search.set("page", String(page));
            search.set("limit", String(FETCH_ALL_PAGE_SIZE));
            return `/api/v1/units?${search.toString()}`;
          };
          const fetchPage = async (page: number) => {
            const res = await fetch(pageUrl(page));
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Failed to fetch units");
            return json as {
              data: Unit[];
              pagination?: { total: number; hasNextPage: boolean };
            };
          };

          const first = await fetchPage(1);
          if (cancelled) return;
          const all: Unit[] = [...(first.data ?? [])];
          const seenTotal = first.pagination?.total ?? all.length;

          if (first.pagination?.hasNextPage) {
            const totalPages = Math.max(2, Math.ceil(seenTotal / FETCH_ALL_PAGE_SIZE));
            const lastPage = Math.min(MAX_FETCH_ALL_PAGES, totalPages);
            const pageNumbers: number[] = [];
            for (let p = 2; p <= lastPage; p++) pageNumbers.push(p);
            for (let i = 0; i < pageNumbers.length; i += 4) {
              const chunk = pageNumbers.slice(i, i + 4);
              const results = await Promise.all(chunk.map(fetchPage));
              if (cancelled) return;
              for (const json of results) all.push(...(json.data ?? []));
            }
          }
          if (cancelled) return;
          setUnits(all);
          setTotal(seenTotal);
          setError(null);
          return;
        }

        const res = await fetch(`/api/v1/units${params.size ? `?${params.toString()}` : ""}`);
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setUnits(json.data);
          setTotal(json.pagination?.total ?? json.data.length);
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
  }, [params, reload, fetchAll, enabled]);

  useEffect(() => {
    const onFocus = () => setReload((n) => n + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const refetch = useCallback(() => setReload((n) => n + 1), []);

  return { units, loading, error, total, refetch };
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
