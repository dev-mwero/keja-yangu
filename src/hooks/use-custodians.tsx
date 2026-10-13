"use client";

import { useCallback, useEffect, useState } from "react";

export interface CustodianRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  managedByOwnerId: string;
}

export function useCustodians() {
  const [custodians, setCustodians] = useState<CustodianRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void reload;
    const fetchCustodians = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/v1/custodians");
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setCustodians(json.data);
          setError(null);
        } else {
          setError(json.error || "Failed to fetch custodians");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchCustodians();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const refetch = useCallback(() => setReload((n) => n + 1), []);

  return { custodians, loading, error, refetch };
}

export interface CustodianInviteInput {
  email: string;
  name?: string;
  phone?: string;
  ownerId?: string;
}

export function useCustodianMutations() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inviteCustodian = async (input: CustodianInviteInput): Promise<CustodianRow> => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/custodians", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) {
        const message = json.error || "Failed to invite custodian";
        setError(message);
        throw new Error(message);
      }
      return json.data as CustodianRow;
    } finally {
      setPending(false);
    }
  };

  const revokeCustodian = async (id: string): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/custodians/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const message = json.error || "Failed to revoke custodian";
        setError(message);
        throw new Error(message);
      }
    } finally {
      setPending(false);
    }
  };

  return { inviteCustodian, revokeCustodian, pending, error };
}
