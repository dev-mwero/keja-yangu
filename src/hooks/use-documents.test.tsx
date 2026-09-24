import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDocuments } from "@/hooks/use-documents";
import type { DashboardDocument } from "@/types/communications";

const document: DashboardDocument = {
  _id: "doc-1",
  name: "Lease agreement — Sunlit Studio",
  category: "lease",
  scope: "tenant",
  propertyId: "prop-1",
  tenantId: "tenant-1",
  ownerId: "owner-1",
  uploadedById: "user-1",
  uploadedByName: "D8 Property Group",
  uploadedBy: "D8 Property Group",
  size: "1.4 MB",
  uploadedAt: "2026-08-01T00:00:00.000Z",
  property: "Sunlit Studio in Kilimani",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

function stubFetch(json: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: vi.fn().mockResolvedValue(json) }),
  );
}

describe("useDocuments", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads documents from GET /api/v1/documents?limit=100", async () => {
    stubFetch({ data: [document] });
    const { result } = renderHook(() => useDocuments());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([document]);
    expect(result.current.error).toBeNull();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/v1/documents?limit=100");
  });

  it("surfaces a non-ok response error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: vi.fn().mockResolvedValue({ error: "Forbidden" }),
      }),
    );
    const { result } = renderHook(() => useDocuments());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Forbidden");
    expect(result.current.items).toEqual([]);
  });
});
