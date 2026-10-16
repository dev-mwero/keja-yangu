"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { MoveRequestStatus, MoveRequestType } from "@/lib/domain-enums";

export type { MoveRequestStatus, MoveRequestType };

export interface MoveRequest {
  _id: string;
  type: MoveRequestType;
  propertyId: string;
  propertyTitle?: string;
  ownerId: string;
  blockId: string;
  unitId: string;
  tenantId: string;
  requestedById: string;
  requestedByName?: string;
  requestedByRole: string;
  requestedFor: string;
  requestedDate?: string;
  note: string;
  status: MoveRequestStatus;
  decidedById: string;
  decisionNote: string;
  decidedAt?: string;
  createdAt: string;
}

export interface MoveRequestFilters {
  status?: MoveRequestStatus;
}

export function useMoveRequests(filters?: MoveRequestFilters) {
  const [moveRequests, setMoveRequests] = useState<MoveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [filters?.status]);

  useEffect(() => {
    let cancelled = false;
    void reload;
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/move-requests${query}`);
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setMoveRequests(json.data);
          setError(null);
        } else {
          setError(json.error || "Failed to fetch move requests");
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
  }, [query, reload]);

  const refetch = useCallback(() => setReload((n) => n + 1), []);
  return { moveRequests, loading, error, refetch };
}

export interface CreateMoveRequestInput {
  type: MoveRequestType;
  propertyId: string;
  unitId?: string;
  tenantId?: string;
  requestedDate?: string;
  note?: string;
}

export function useMoveRequestMutations() {
  const [pending, setPending] = useState(false);

  const create = async (input: CreateMoveRequestInput): Promise<MoveRequest> => {
    setPending(true);
    try {
      const res = await fetch("/api/v1/move-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create move request");
      return json.data as MoveRequest;
    } finally {
      setPending(false);
    }
  };

  const decide = async (
    id: string,
    status: MoveRequestStatus,
    decisionNote?: string,
  ): Promise<MoveRequest> => {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/move-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, decisionNote }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update move request");
      return json.data as MoveRequest;
    } finally {
      setPending(false);
    }
  };

  return { decide, create, pending };
}
