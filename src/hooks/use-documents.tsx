"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DocumentCategory, DocumentScope } from "@/lib/domain-enums";
import type { DashboardDocument } from "@/types/communications";

/**
 * Fetches the tenant document metadata list (`limit=100`). Downloads stay a
 * client-side mock (metadata rows carry no content) — the page reads the
 * denormalized `name`/`size`/`uploadedBy` fields unchanged.
 */
export function useDocuments() {
  const [items, setItems] = useState<DashboardDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const query = useMemo(() => "?limit=100", []);

  useEffect(() => {
    let cancelled = false;
    void reload;
    const fetchItems = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/documents${query}`);
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setItems(json.data ?? []);
          setError(null);
        } else {
          setError(json.error || "Failed to fetch documents");
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

export interface CreateDocumentInput {
  name: string;
  category: DocumentCategory;
  scope?: DocumentScope;
  /** Empty string = portfolio-wide landlord document. */
  propertyId?: string;
  tenantId?: string;
  sizeLabel?: string;
}

/** Creates a document metadata row via `POST /api/v1/documents`. */
export function useDocumentMutations() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createDocument = useCallback(async (input: CreateDocumentInput) => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to create document");
      }
      return json.data as DashboardDocument;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create document";
      setError(message);
      throw err;
    } finally {
      setPending(false);
    }
  }, []);

  return { createDocument, pending, error };
}
