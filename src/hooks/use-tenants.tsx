"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type TenantStatus = "active" | "pending" | "rejected";
export type TenantType = "residential" | "commercial" | "owning";

export interface TenantUnitSummary {
  _id: string;
  name: string;
  blockName: string;
  propertyId?: string;
}

export interface Tenant {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  propertyId: string;
  ownerId: string;
  type?: TenantType;
  status: TenantStatus;
  joinedAt?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  /** All units the tenant occupies. */
  units?: TenantUnitSummary[];
  /** The unit the tenant currently occupies (first unit if multi-unit), if any. */
  unit?: TenantUnitSummary | null;
  /** The unit the tenant most recently requested (pending move-in), if any. */
  requestedUnit?: TenantUnitSummary | null;
}

export interface TenantInput {
  name: string;
  email: string;
  phone?: string;
  propertyId: string;
  type?: TenantType;
  status?: TenantStatus;
  notes?: string;
}

export interface TenantFilters {
  status?: TenantStatus;
  propertyId?: string;
}

export interface UseTenantsOptions {
  /**
   * When false, skip fetching entirely (tenants stays empty). Useful for lazily
   * loading an assignment picker only once its dialog is open.
   */
  enabled?: boolean;
}

export function useTenants(filters?: TenantFilters, options?: UseTenantsOptions) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const enabled = options?.enabled ?? true;

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.propertyId) params.set("propertyId", filters.propertyId);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [filters?.status, filters?.propertyId]);

  useEffect(() => {
    let cancelled = false;
    void reload;
    const fetchTenants = async () => {
      if (!enabled) {
        setTenants([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/tenants${query}`);
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setTenants(json.data);
          setError(null);
        } else {
          setError(json.error || "Failed to fetch tenants");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchTenants();
    return () => {
      cancelled = true;
    };
  }, [query, reload, enabled]);

  const refetch = useCallback(() => setReload((n) => n + 1), []);

  return { tenants, loading, error, refetch };
}

export function usePropertyTenants(propertyId?: string, options?: UseTenantsOptions) {
  const filters = propertyId ? { propertyId, status: "active" as const } : undefined;
  const { tenants, loading, error, refetch } = useTenants(filters, options);
  const unassignedTenants = useMemo(() => tenants.filter((t) => !t.unit), [tenants]);
  return { tenants, unassignedTenants, loading, error, refetch };
}

export function useTenantMutations() {
  const [pending, setPending] = useState(false);

  const createTenant = async (input: TenantInput): Promise<Tenant> => {
    setPending(true);
    try {
      const res = await fetch("/api/v1/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to create tenant");
      }
      return json.data as Tenant;
    } finally {
      setPending(false);
    }
  };

  const updateTenant = async (id: string, input: Partial<TenantInput>): Promise<Tenant> => {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/tenants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to update tenant");
      }
      return json.data as Tenant;
    } finally {
      setPending(false);
    }
  };

  const deleteTenant = async (id: string): Promise<void> => {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/tenants/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to delete tenant");
      }
    } finally {
      setPending(false);
    }
  };

  const assignUnit = async (id: string, unitId: string): Promise<void> => {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/tenants/${id}/assignment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to assign unit");
      }
    } finally {
      setPending(false);
    }
  };

  const vacateUnit = async (id: string): Promise<void> => {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/tenants/${id}/assignment`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to vacate unit");
      }
    } finally {
      setPending(false);
    }
  };

  return { createTenant, updateTenant, deleteTenant, assignUnit, vacateUnit, pending };
}
