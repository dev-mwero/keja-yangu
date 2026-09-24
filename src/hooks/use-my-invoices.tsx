"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { InvoiceMarkPaidInput } from "@/lib/schemas";
import type { Invoice } from "@/types/invoicing";

export interface MyInvoiceFilters {
  status?: string;
  period?: string;
}

export function useMyInvoices(filters?: MyInvoiceFilters) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: "100" });
    if (filters?.status) params.set("status", filters.status);
    if (filters?.period) params.set("period", filters.period);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [filters?.period, filters?.status]);

  useEffect(() => {
    let cancelled = false;
    void reload;
    const fetchInvoices = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/tenant/me/invoices${query}`);
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setInvoices(json.data);
          setError(null);
        } else {
          setError(json.error || "Failed to fetch invoices");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchInvoices();
    return () => {
      cancelled = true;
    };
  }, [query, reload]);

  const refetch = useCallback(() => setReload((n) => n + 1), []);

  return { invoices, loading, error, refetch };
}

export function useMyInvoiceMutations() {
  const [pending, setPending] = useState(false);

  const markOwnPaid = async (id: string, input: InvoiceMarkPaidInput = {}): Promise<Invoice> => {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/tenant/me/invoices/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to mark invoice as paid");
      }
      return json.data as Invoice;
    } finally {
      setPending(false);
    }
  };

  return { markOwnPaid, pending };
}
