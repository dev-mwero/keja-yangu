import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const records: Array<Record<string, unknown>> = [];
  const flags = { loading: false, error: null as string | null };
  const refetchCounts = vi.fn();
  const refetch = vi.fn();
  const restore = vi.fn().mockResolvedValue(undefined);
  const purge = vi.fn().mockResolvedValue(undefined);
  const toast = { success: vi.fn(), error: vi.fn() };
  return {
    records,
    flags,
    refetchCounts,
    refetch,
    restore,
    purge,
    toast,
    counts: {} as Record<string, number>,
    pagination: null as null | Record<string, unknown>,
    useRecycleBinCounts: () => ({
      counts: mocks.counts,
      loading: false,
      error: null,
      refetch: refetchCounts,
    }),
    useRecycleBinRecords: () => ({
      records,
      pagination: mocks.pagination,
      loading: flags.loading,
      error: flags.error,
      refetch,
    }),
    useRecycleBinMutations: () => ({ restore, purge, pendingId: null }),
  };
});

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/hooks/use-recycle-bin", () => ({
  useRecycleBinCounts: mocks.useRecycleBinCounts,
  useRecycleBinRecords: mocks.useRecycleBinRecords,
  useRecycleBinMutations: mocks.useRecycleBinMutations,
}));

import { RecycleBinManager } from "@/components/admin/RecycleBinManager";

function resetState() {
  mocks.records.length = 0;
  mocks.counts = { property: 0, unit: 0, tenant: 0, lease: 0, invoice: 0, propertytype: 0 };
  mocks.pagination = null;
  mocks.flags.loading = false;
  mocks.flags.error = null;
  mocks.restore.mockClear();
  mocks.purge.mockClear();
  mocks.refetch.mockClear();
  mocks.refetchCounts.mockClear();
  mocks.toast.success.mockClear();
  mocks.toast.error.mockClear();
}

beforeEach(resetState);

describe("RecycleBinManager", () => {
  it("shows an empty state for a type with no deleted records", () => {
    render(<RecycleBinManager />);
    expect(screen.getByText(/nothing has been deleted here/i)).toBeInTheDocument();
  });

  it("renders deleted records with a label and deletion date", () => {
    mocks.records.push({ _id: "p1", title: "Sunset Villa", deletedAt: "2026-01-02T10:00:00.000Z" });
    mocks.counts = { property: 1, unit: 0, tenant: 0, lease: 0, invoice: 0, propertytype: 0 };

    render(<RecycleBinManager />);
    expect(screen.getByText("Sunset Villa")).toBeInTheDocument();
  });

  it("restores a record and refreshes counts + list", async () => {
    mocks.records.push({ _id: "p1", title: "Sunset Villa", deletedAt: "2026-01-02T10:00:00.000Z" });

    render(<RecycleBinManager />);
    await userEvent.click(screen.getByRole("button", { name: /restore/i }));

    await waitFor(() => expect(mocks.restore).toHaveBeenCalledWith("property", "p1"));
    expect(mocks.toast.success).toHaveBeenCalled();
    expect(mocks.refetch).toHaveBeenCalled();
    expect(mocks.refetchCounts).toHaveBeenCalled();
  });

  it("surfaces a restore failure with a toast", async () => {
    mocks.records.push({ _id: "p1", title: "Sunset Villa", deletedAt: "2026-01-02T10:00:00.000Z" });
    mocks.restore.mockRejectedValueOnce(new Error("Not found"));

    render(<RecycleBinManager />);
    await userEvent.click(screen.getByRole("button", { name: /restore/i }));

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled());
  });

  it("purges a record only after confirmation", async () => {
    mocks.records.push({ _id: "p1", title: "Sunset Villa", deletedAt: "2026-01-02T10:00:00.000Z" });

    render(<RecycleBinManager />);
    expect(mocks.purge).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await userEvent.click(await screen.findByRole("button", { name: /delete permanently/i }));

    await waitFor(() => expect(mocks.purge).toHaveBeenCalledWith("property", "p1"));
    expect(mocks.toast.success).toHaveBeenCalled();
  });
});
