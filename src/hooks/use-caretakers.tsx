"use client";

import { useCallback, useEffect, useState } from "react";

export interface CaretakerRow {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  managedByOwnerId: string;
  privileges: string[];
  propertyCount: number;
}

export interface CaretakerInviteInput {
  email?: string;
  name?: string;
  phone?: string;
  ownerId?: string;
  privileges?: string[];
}

export interface CaretakerInviteResult {
  member: CaretakerRow;
  /** One-time password for a phone-only account. */
  temporaryPassword?: string;
}

export function useCaretakers() {
  const [caretakers, setCaretakers] = useState<CaretakerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void reload;
    const fetchCaretakers = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/v1/caretakers");
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setCaretakers(json.data);
          setError(null);
        } else {
          setError(json.error || "Failed to fetch caretakers");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchCaretakers();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const refetch = useCallback(() => setReload((n) => n + 1), []);

  return { caretakers, loading, error, refetch };
}

export function useCaretakerMutations() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inviteCaretaker = async (input: CaretakerInviteInput): Promise<CaretakerInviteResult> => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/caretakers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) {
        const message = json.error || "Failed to invite caretaker";
        setError(message);
        throw new Error(message);
      }
      return {
        member: json.data as CaretakerRow,
        temporaryPassword: typeof json.password === "string" ? json.password : undefined,
      };
    } finally {
      setPending(false);
    }
  };

  return { inviteCaretaker, pending, error };
}

export function useUpdateCaretakerPrivileges() {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updatePrivileges = async (id: string, privileges: string[]): Promise<CaretakerRow> => {
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/caretakers/${id}/privileges`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privileges }),
      });
      const json = await res.json();
      if (!res.ok) {
        const message = json.error || "Failed to update privileges";
        setError(message);
        throw new Error(message);
      }
      return json.data as CaretakerRow;
    } finally {
      setPendingId(null);
    }
  };

  return { updatePrivileges, pendingId, error };
}
