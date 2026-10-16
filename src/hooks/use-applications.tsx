"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { type Application, type ApplicationDoc, toApplication } from "@/lib/applications";
import type { ApplicationStatus } from "@/lib/domain-enums";

export type { Application, ApplicationStatus };

export interface ApplicationFilters {
  status?: ApplicationStatus;
}

interface UseApplicationsOptions {
  enabled?: boolean;
}

export function useApplications(
  filters?: ApplicationFilters,
  options: UseApplicationsOptions = {},
) {
  const enabled = options.enabled ?? true;
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [filters?.status]);

  useEffect(() => {
    if (!enabled) {
      setApplications([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    void reload;
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/applications${query}`);
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setApplications((json.data as ApplicationDoc[]).map(toApplication));
          setError(null);
        } else {
          setError(json.error || "Failed to fetch applications");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [query, reload, enabled]);

  const refetch = useCallback(() => setReload((n) => n + 1), []);
  return { applications, loading, error, refetch, refresh: refetch };
}

/**
 * Backwards-compatible alias for the tenant dashboard. The server scopes the
 * list to the signed-in tenant, so the email argument is no longer used.
 */
export function useTenantApplications(_email?: string) {
  return useApplications();
}

export interface CreateApplicationInput {
  propertyId: string;
  name: string;
  email: string;
  message?: string;
}

export function useApplicationMutations() {
  const [pending, setPending] = useState(false);

  const create = async (input: CreateApplicationInput): Promise<Application> => {
    setPending(true);
    try {
      const res = await fetch("/api/v1/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to submit application");
      return toApplication(json.data as ApplicationDoc);
    } finally {
      setPending(false);
    }
  };

  const decide = async (
    id: string,
    status: ApplicationStatus,
    decisionNote?: string,
  ): Promise<Application> => {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, decisionNote }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update application");
      return toApplication(json.data as ApplicationDoc);
    } finally {
      setPending(false);
    }
  };

  const withdraw = async (id: string): Promise<void> => {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/applications/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to withdraw application");
      }
    } finally {
      setPending(false);
    }
  };

  return { create, decide, withdraw, pending };
}
