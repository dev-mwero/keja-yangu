import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const toast = { success: vi.fn(), error: vi.fn() };
  return {
    toast,
    currentUser: null as null | Record<string, unknown>,
    useAuth: () => ({ user: mocks.currentUser }),
  };
});

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: mocks.useAuth }));

import { CommissionManager } from "@/components/admin/CommissionManager";

const eligible = {
  _id: "a1",
  brokerUserId: "broker-1",
  invoiceId: "inv-1",
  kind: "rent_share",
  grossMinor: 100000,
  taxMinor: 15000,
  netMinor: 85000,
  status: "eligible",
};
const approved = { ...eligible, _id: "a2", status: "approved" };

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

const ok = (data: unknown) =>
  Promise.resolve({ ok: true, json: async () => ({ data }) } as Response);

function resetState() {
  mocks.currentUser = { id: "me", role: "system-admin" };
  mocks.toast.success.mockClear();
  mocks.toast.error.mockClear();
}

beforeEach(resetState);
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CommissionManager", () => {
  it("renders accruals and approves eligible rows", async () => {
    stubFetch((url) => {
      if (url.startsWith("/api/v1/commissions")) return ok([eligible, approved]);
      return ok([]);
    });
    render(<CommissionManager />);

    expect(await screen.findByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByText("Ready to Batch")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("Commission approved"));
  });

  it("skips payout fetches and explains system-admin-only when payouts are not manageable", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith("/api/v1/admin/commission-payouts")) {
        return Promise.reject(new Error("should not be called"));
      }
      return ok([eligible]);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CommissionManager canManagePayouts={false} />);

    expect(await screen.findByText(/payouts are managed by system-admin/i)).toBeInTheDocument();
    expect(screen.queryByText("Ready to Batch")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/admin/commission-payouts"),
      expect.anything(),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/admin/commission-payouts"),
    );
  });

  it("shows an empty state when there are no accruals", async () => {
    stubFetch(() => ok([]));
    render(<CommissionManager />);

    expect(await screen.findByText(/no commission accruals yet/i)).toBeInTheDocument();
  });

  it("hides clawback for the admin role", async () => {
    mocks.currentUser = { id: "me", role: "admin" };
    stubFetch(() => ok([approved]));
    render(<CommissionManager />);

    expect(await screen.findByText("Ready to Batch")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /clawback/i })).not.toBeInTheDocument();
  });

  it("shows clawback for the system-admin role", async () => {
    mocks.currentUser = { id: "me", role: "system-admin" };
    stubFetch(() => ok([approved]));
    render(<CommissionManager />);

    expect(await screen.findByRole("button", { name: /clawback/i })).toBeInTheDocument();
  });
});
