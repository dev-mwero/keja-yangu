import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useComplaintMutations, useComplaints } from "@/hooks/use-complaints";
import type { Complaint } from "@/types/communications";

const complaint: Complaint = {
  _id: "cpt-1",
  tenantId: "tenant-1",
  propertyId: "prop-1",
  ownerId: "owner-1",
  subject: "Loose bathroom tap",
  category: "Maintenance",
  message: "The bathroom tap is leaking.",
  status: "open",
  priority: "medium",
  property: "Sunlit Studio in Kilimani",
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T08:00:00.000Z",
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

describe("useComplaints", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads complaints from GET /api/v1/complaints?limit=100", async () => {
    stubFetch({ json: { data: [complaint] } });
    const { result } = renderHook(() => useComplaints());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([complaint]);
    expect(result.current.error).toBeNull();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/v1/complaints?limit=100");
  });

  it("appends the status filter to the query string", async () => {
    stubFetch({ json: { data: [] } });
    const { result } = renderHook(() => useComplaints({ status: "resolved" }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/v1/complaints?limit=100&status=resolved");
  });

  it("surfaces a non-ok response error", async () => {
    stubFetch({ ok: false, json: { error: "Forbidden" } });
    const { result } = renderHook(() => useComplaints());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Forbidden");
    expect(result.current.items).toEqual([]);
  });
});

describe("useComplaintMutations", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("createComplaint POSTs and returns the created complaint", async () => {
    stubFetch({ json: { data: complaint } });
    const { result } = renderHook(() => useComplaintMutations());

    let out: Complaint | undefined;
    await act(async () => {
      out = await result.current.createComplaint({
        subject: "Loose bathroom tap",
        category: "Maintenance",
        message: "The bathroom tap is leaking.",
        priority: "medium",
      });
    });
    expect(out).toEqual(complaint);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/v1/complaints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: "Loose bathroom tap",
        category: "Maintenance",
        message: "The bathroom tap is leaking.",
        priority: "medium",
      }),
    });
    expect(result.current.pending).toBe(false);
  });

  it("createComplaint throws the API error on a non-ok response", async () => {
    stubFetch({ ok: false, json: { error: "Forbidden" } });
    const { result } = renderHook(() => useComplaintMutations());

    let rejection: unknown;
    await act(async () => {
      rejection = await result.current
        .createComplaint({
          subject: "x",
          category: "Other",
          message: "y",
          priority: "low",
        })
        .catch((err: unknown) => err);
    });
    expect((rejection as Error).message).toBe("Forbidden");
  });

  it("updateStatus PATCHes and returns the updated complaint", async () => {
    const resolved = { ...complaint, status: "resolved" as const, resolution: "Fixed." };
    stubFetch({ json: { data: resolved } });
    const { result } = renderHook(() => useComplaintMutations());

    let out: Complaint | undefined;
    await act(async () => {
      out = await result.current.updateStatus("cpt-1", {
        status: "resolved",
        resolution: "Fixed.",
      });
    });
    expect(out).toEqual(resolved);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/v1/complaints/cpt-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved", resolution: "Fixed." }),
    });
  });
});
