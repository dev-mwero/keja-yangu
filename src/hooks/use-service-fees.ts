"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ResolvedServiceFee,
  ServiceFeeItem,
  ServiceFeeOverride,
} from "@/types/service-fees";

export interface ServiceFeePayload {
  label: string;
  amount: number;
  active?: boolean;
  sortOrder?: number;
  appliesTo?: "all" | "selected";
  unitIds?: string[];
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body.data as T;
}

export function usePropertyServiceFees(propertyId: string | undefined) {
  const [items, setItems] = useState<ServiceFeeItem[]>([]);
  const [overrides, setOverrides] = useState<ServiceFeeOverride[]>([]);
  const [loading, setLoading] = useState(Boolean(propertyId));
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!propertyId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    requestJson<{ items: ServiceFeeItem[]; overrides: ServiceFeeOverride[] }>(
      `/api/v1/properties/${propertyId}/service-fees`,
    )
      .then((data) => {
        if (cancelled) return;
        setItems(Array.isArray(data.items) ? data.items : []);
        setOverrides(Array.isArray(data.overrides) ? data.overrides : []);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not load service fees");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId, reload]);

  const refetch = useCallback(() => setReload((value) => value + 1), []);
  return { items, overrides, loading, error, refetch };
}

export function useUnitServiceFee(unitId: string | undefined, enabled = true) {
  const [fee, setFee] = useState<ResolvedServiceFee | null>(null);
  const [loading, setLoading] = useState(Boolean(unitId && enabled));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!unitId || !enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    requestJson<ResolvedServiceFee>(`/api/v1/units/${unitId}/service-fees`)
      .then((data) => {
        if (!cancelled) {
          setFee(data);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not load the unit fee");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [unitId, enabled]);

  return { fee, loading, error };
}

export async function createServiceFee(
  propertyId: string,
  payload: ServiceFeePayload,
): Promise<ServiceFeeItem> {
  return requestJson<ServiceFeeItem>(`/api/v1/properties/${propertyId}/service-fees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateServiceFee(
  propertyId: string,
  itemId: string,
  payload: Partial<ServiceFeePayload>,
): Promise<ServiceFeeItem> {
  return requestJson<ServiceFeeItem>(
    `/api/v1/properties/${propertyId}/service-fees/${itemId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function disableServiceFee(
  propertyId: string,
  itemId: string,
): Promise<ServiceFeeItem> {
  return requestJson<ServiceFeeItem>(
    `/api/v1/properties/${propertyId}/service-fees/${itemId}`,
    { method: "DELETE" },
  );
}

export async function saveUnitOverrides(
  propertyId: string,
  unitId: string,
  overrides: Array<{ itemId: string; amount: number | null; active: boolean | null }>,
): Promise<ServiceFeeOverride[]> {
  return requestJson<ServiceFeeOverride[]>(
    `/api/v1/properties/${propertyId}/service-fees/overrides`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unitId, overrides }),
    },
  );
}
