"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InvoiceInput, InvoiceMarkPaidInput, InvoiceUpdate } from "@/lib/schemas";
import type { Invoice } from "@/types/invoicing";

export interface InvoiceFilters {
  period?: string;
  status?: string;
  tenantId?: string;
  propertyId?: string;
  leaseId?: string;
}

function useInvoicesQuery(filters: InvoiceFilters | undefined, ready: boolean) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: "100" });
    if (filters?.period) params.set("period", filters.period);
    if (filters?.status) params.set("status", filters.status);
    if (filters?.tenantId) params.set("tenantId", filters.tenantId);
    if (filters?.propertyId) params.set("propertyId", filters.propertyId);
    if (filters?.leaseId) params.set("leaseId", filters.leaseId);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [filters?.leaseId, filters?.period, filters?.propertyId, filters?.status, filters?.tenantId]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void reload;
    const fetchInvoices = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/invoices${query}`);
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
  }, [query, ready, reload]);

  const refetch = useCallback(() => setReload((n) => n + 1), []);

  return { invoices, loading, error, refetch };
}

export function useInvoices(filters?: InvoiceFilters) {
  return useInvoicesQuery(filters, true);
}

/**
 * Staff list hook with an on-mount generate sweep: fires one idempotent
 * `POST /api/v1/invoices/generate` before the first GET so a freshly-opened
 * accounting/report page never shows stale months. Failures are ignored
 * silently (the endpoint is idempotent and the sweep is best-effort).
 */
export function useStaffInvoices(filters?: InvoiceFilters) {
  const [swept, setSwept] = useState(false);
  const sweptRef = useRef(false);

  useEffect(() => {
    if (sweptRef.current) return;
    sweptRef.current = true;
    let cancelled = false;
    const sweep = async () => {
      try {
        await fetch("/api/v1/invoices/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
      } catch {
        // best-effort sweep — the generate endpoint is idempotent
      }
      if (!cancelled) setSwept(true);
    };
    void sweep();
    return () => {
      cancelled = true;
    };
  }, []);

  return useInvoicesQuery(filters, swept);
}

export function useInvoiceMutations() {
  const [pending, setPending] = useState(false);

  const createInvoice = async (input: InvoiceInput): Promise<Invoice> => {
    setPending(true);
    try {
      const res = await fetch("/api/v1/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to create invoice");
      }
      return json.data as Invoice;
    } finally {
      setPending(false);
    }
  };

  const updateInvoice = async (id: string, input: InvoiceUpdate): Promise<Invoice> => {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to update invoice");
      }
      return json.data as Invoice;
    } finally {
      setPending(false);
    }
  };

  const markPaid = async (id: string, input: InvoiceMarkPaidInput = {}): Promise<Invoice> => {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/invoices/${id}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to record payment");
      }
      return json.data as Invoice;
    } finally {
      setPending(false);
    }
  };

  const voidInvoice = async (id: string): Promise<Invoice> => {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/invoices/${id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to void invoice");
      }
      return json.data as Invoice;
    } finally {
      setPending(false);
    }
  };

  const deleteInvoice = async (id: string): Promise<void> => {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/invoices/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to delete invoice");
      }
    } finally {
      setPending(false);
    }
  };

  const generate = async (period?: string): Promise<{ created: number; skipped: number }> => {
    setPending(true);
    try {
      const res = await fetch("/api/v1/invoices/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(period ? { period } : {}),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to generate invoices");
      }
      return json.data as { created: number; skipped: number };
    } finally {
      setPending(false);
    }
  };

  return {
    createInvoice,
    updateInvoice,
    markPaid,
    voidInvoice,
    deleteInvoice,
    generate,
    pending,
  };
}
