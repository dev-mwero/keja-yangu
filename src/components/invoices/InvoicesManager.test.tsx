import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentPeriod } from "@/lib/invoicing";
import type { Invoice } from "@/types/invoicing";

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    _id: "inv-1",
    invoiceNumber: "INV-202609-0001",
    tenantId: "tenant-1",
    propertyId: "prop-1",
    leaseId: "lease-1",
    ownerId: "owner-1",
    period: "2026-09",
    amountDue: 100,
    amountPaid: 0,
    status: "pending",
    overdue: false,
    dueDate: "2026-10-05T00:00:00.000Z",
    issuedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

const mocks = vi.hoisted(() => {
  const invoices = [] as Invoice[];
  const flags = {
    loading: false,
    error: null as string | null,
  };
  const generate = vi.fn();
  const refetch = vi.fn();
  const toast = { success: vi.fn(), error: vi.fn() };
  return {
    invoices,
    flags,
    generate,
    refetch,
    toast,
    useStaffInvoices: () => ({
      invoices,
      loading: flags.loading,
      error: flags.error,
      refetch,
    }),
    useInvoiceMutations: () => ({
      createInvoice: vi.fn(),
      updateInvoice: vi.fn(),
      markPaid: vi.fn(),
      voidInvoice: vi.fn(),
      deleteInvoice: vi.fn(),
      generate,
      pending: false,
    }),
  };
});

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/hooks/use-invoices", () => ({
  useStaffInvoices: mocks.useStaffInvoices,
  useInvoiceMutations: mocks.useInvoiceMutations,
}));

import { InvoicesManager } from "@/components/invoices/InvoicesManager";

function renderManager(canManage = true) {
  return render(<InvoicesManager nav={[]} roleName="Owner" canManage={canManage} />);
}

function statValue(label: string): HTMLElement {
  const labelEl = screen.getByText(label);
  return labelEl.parentElement as HTMLElement;
}

describe("InvoicesManager", () => {
  beforeEach(() => {
    mocks.invoices.length = 0;
    mocks.flags.loading = false;
    mocks.flags.error = null;
    mocks.toast.success.mockClear();
    mocks.toast.error.mockClear();
    mocks.generate.mockReset();
    mocks.refetch.mockReset();
  });

  it("computes billing stats that exclude voided invoices", () => {
    mocks.invoices.push(
      makeInvoice({
        _id: "inv-p",
        invoiceNumber: "INV-202609-0001",
        amountDue: 100,
        status: "pending",
      }),
      makeInvoice({
        _id: "inv-o",
        invoiceNumber: "INV-202609-0002",
        amountDue: 50,
        status: "paid",
        amountPaid: 50,
      }),
      makeInvoice({
        _id: "inv-v",
        invoiceNumber: "INV-202609-0003",
        amountDue: 40,
        status: "void",
      }),
    );
    renderManager();

    // Billed = pending 100 + paid 50 (void 40 excluded) = 150
    expect(statValue("Billed")).toHaveTextContent(/150/);
    expect(statValue("Billed")).not.toHaveTextContent(/190/);
    // Collected = 50 on a 150 base → 33% collection rate
    expect(statValue("Collected")).toHaveTextContent(/50/);
    expect(statValue("Collected")).toHaveTextContent(/33%/);
    // Outstanding = pending 100, 1 open invoice
    expect(statValue("Outstanding")).toHaveTextContent(/100/);
    expect(statValue("Outstanding")).toHaveTextContent(/1 open/);
    // This month = collected for the latest period
    expect(statValue("This month")).toHaveTextContent(/50/);
  });

  it("filters rows client-side by tab", async () => {
    const user = userEvent.setup();
    mocks.invoices.push(
      makeInvoice({
        _id: "inv-p",
        invoiceNumber: "INV-202609-0001",
        amountDue: 100,
        status: "pending",
      }),
      makeInvoice({
        _id: "inv-o",
        invoiceNumber: "INV-202609-0002",
        amountDue: 50,
        status: "paid",
        amountPaid: 50,
      }),
    );
    renderManager();

    expect(screen.getByText("INV-202609-0001")).toBeInTheDocument();
    expect(screen.getByText("INV-202609-0002")).toBeInTheDocument();

    // tabs render in order: all, pending, overdue, paid, draft, void
    await user.click(screen.getAllByRole("tab")[3]);

    expect(screen.getByText("INV-202609-0002")).toBeInTheDocument();
    expect(screen.queryByText("INV-202609-0001")).not.toBeInTheDocument();
  });

  it("opens the generate dialog and reports the generated month", async () => {
    const user = userEvent.setup();
    mocks.invoices.push(
      makeInvoice({
        _id: "inv-p",
        invoiceNumber: "INV-202609-0001",
        amountDue: 100,
        status: "pending",
      }),
    );
    mocks.generate.mockResolvedValue({ created: 1, skipped: 0 });
    renderManager();

    await user.click(screen.getByRole("button", { name: /generate month/i }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Generate month")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Generate" }));

    await waitFor(() => expect(mocks.generate).toHaveBeenCalledWith(currentPeriod()));
    expect(mocks.toast.success).toHaveBeenCalledWith(
      "Invoices generated",
      expect.objectContaining({ description: expect.stringContaining("1 created") }),
    );
    expect(mocks.refetch).toHaveBeenCalled();
  });

  it("renders a loading state", () => {
    mocks.flags.loading = true;
    renderManager();
    expect(screen.getByText(/loading invoices/i)).toBeInTheDocument();
  });

  it("renders an error state", () => {
    mocks.flags.error = "Failed to fetch invoices";
    renderManager();
    expect(screen.getByText("Failed to fetch invoices")).toBeInTheDocument();
  });

  it("renders the empty state", () => {
    renderManager();
    expect(screen.getByText("No invoices here")).toBeInTheDocument();
  });
});
