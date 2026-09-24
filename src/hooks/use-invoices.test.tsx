import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInvoiceMutations, useInvoices, useStaffInvoices } from "@/hooks/use-invoices";
import type { Invoice } from "@/types/invoicing";

const invoice: Invoice = {
  _id: "inv-1",
  invoiceNumber: "INV-202609-0001",
  tenantId: "tenant-1",
  propertyId: "prop-1",
  leaseId: "lease-1",
  ownerId: "owner-1",
  period: "2026-09",
  amountDue: 25000,
  amountPaid: 0,
  status: "pending",
  overdue: false,
  dueDate: "2026-10-05T00:00:00.000Z",
  issuedAt: "2026-09-01T00:00:00.000Z",
};

function stubFetch(result: { ok?: boolean; json?: unknown; error?: unknown }) {
  const json = vi.fn();
  if (result.error) {
    json.mockRejectedValue(result.error);
  } else {
    json.mockResolvedValue(result.json);
  }
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({ ok: result.ok ?? true, status: result.ok === false ? 403 : 200, json }),
  );
}

describe("useInvoices", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads invoices from GET /api/v1/invoices?limit=100", async () => {
    stubFetch({ json: { data: [invoice] } });
    const { result } = renderHook(() => useInvoices());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.invoices).toEqual([invoice]);
    expect(result.current.error).toBeNull();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/v1/invoices?limit=100");
  });

  it("appends the supplied filters to the query string", async () => {
    stubFetch({ json: { data: [] } });
    const { result } = renderHook(() =>
      useInvoices({ period: "2026-09", status: "overdue", propertyId: "p1" }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/v1/invoices?limit=100&period=2026-09&status=overdue&propertyId=p1",
    );
  });

  it("surfaces a non-ok response error", async () => {
    stubFetch({ ok: false, json: { error: "Forbidden" } });
    const { result } = renderHook(() => useInvoices());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Forbidden");
    expect(result.current.invoices).toEqual([]);
  });

  it("refetch triggers a second request", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ data: [] }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ data: [invoice] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useInvoices());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => result.current.refetch());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.invoices).toEqual([invoice]));
  });
});

describe("useStaffInvoices", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fires the idempotent generate sweep before loading the list", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ data: { created: 0, skipped: 1 } }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ data: [invoice] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useStaffInvoices());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/invoices/generate");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/invoices?limit=100");
    expect(result.current.invoices).toEqual([invoice]);
  });

  it("still loads the list when the generate sweep fails", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockRejectedValueOnce(new Error("sweep boom"));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ data: [invoice] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useStaffInvoices());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.invoices).toEqual([invoice]);
    expect(result.current.error).toBeNull();
  });
});

describe("useInvoiceMutations", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("generate posts the period and returns the created/skipped counts", async () => {
    stubFetch({ json: { data: { created: 3, skipped: 1 } } });
    const { result } = renderHook(() => useInvoiceMutations());

    let out: { created: number; skipped: number } | undefined;
    await act(async () => {
      out = await result.current.generate("2026-09");
    });
    expect(out).toEqual({ created: 3, skipped: 1 });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/v1/invoices/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period: "2026-09" }),
    });
    expect(result.current.pending).toBe(false);
  });

  it("generate defaults to an empty body without a period", async () => {
    stubFetch({ json: { data: { created: 0, skipped: 0 } } });
    const { result } = renderHook(() => useInvoiceMutations());

    await act(async () => {
      await result.current.generate();
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/v1/invoices/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  });

  it("generate throws the API error on a non-ok response", async () => {
    stubFetch({ ok: false, json: { error: "Cannot generate invoices for future periods" } });
    const { result } = renderHook(() => useInvoiceMutations());

    let rejection: unknown;
    await act(async () => {
      rejection = await result.current.generate("2099-01").catch((err: unknown) => err);
    });
    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toBe("Cannot generate invoices for future periods");
  });

  it("markPaid posts to mark-paid and returns the updated invoice", async () => {
    const paid = { ...invoice, status: "paid" as const, amountPaid: 25000 };
    stubFetch({ json: { data: paid } });
    const { result } = renderHook(() => useInvoiceMutations());

    let out: Invoice | undefined;
    await act(async () => {
      out = await result.current.markPaid("inv-1", { method: "M-Pesa" });
    });
    expect(out).toEqual(paid);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/v1/invoices/inv-1/mark-paid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "M-Pesa" }),
    });
  });
});
