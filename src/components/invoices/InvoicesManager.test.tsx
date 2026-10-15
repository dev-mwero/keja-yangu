import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

function makeAmounts(overrides: Record<string, unknown> = {}) {
  return {
    potentialMonthlyRent: 0,
    occupiedMonthlyRent: 0,
    contractedRent: 0,
    rentBilled: 0,
    rentCollected: 0,
    rentOutstanding: 0,
    openInvoiceCount: 0,
    period: "2026-09",
    byPeriod: [] as unknown[],
    unitCount: 0,
    invoiceCount: 0,
    occupiedUnitCount: 0,
    ...overrides,
  };
}

const mocks = vi.hoisted(() => {
  const invoices = [] as Invoice[];
  const state = {
    loading: false,
    error: null as string | null,
    amounts: {} as Record<string, unknown>,
    amountsError: null as string | null,
  };
  const generate = vi.fn();
  const refetch = vi.fn();
  const toast = { success: vi.fn(), error: vi.fn() };
  return {
    invoices,
    state,
    generate,
    refetch,
    toast,
    useStaffInvoices: vi.fn(() => ({
      invoices,
      loading: state.loading,
      error: state.error,
      refetch,
    })),
    useAmounts: vi.fn(() => ({
      amounts: state.amounts,
      loading: false,
      error: state.amountsError,
      refetch,
    })),
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
vi.mock("@/hooks/use-amounts", () => ({ useAmounts: mocks.useAmounts }));

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
    mocks.state.loading = false;
    mocks.state.error = null;
    mocks.state.amounts = makeAmounts();
    mocks.state.amountsError = null;
    mocks.toast.success.mockClear();
    mocks.toast.error.mockClear();
    mocks.generate.mockReset();
    mocks.refetch.mockReset();
    mocks.useStaffInvoices.mockClear();
    mocks.useAmounts.mockClear();
  });

  it("renders the server-computed rent roll and collection stats", () => {
    mocks.state.amounts = makeAmounts({
      potentialMonthlyRent: 100000,
      occupiedMonthlyRent: 60000,
      contractedRent: 55000,
      rentBilled: 50000,
      rentCollected: 25000,
      rentOutstanding: 25000,
      openInvoiceCount: 2,
      invoiceCount: 3,
    });
    renderManager();

    expect(statValue("Potential Monthly Rent")).toHaveTextContent(/100,000/);
    expect(statValue("Occupied Monthly Rent")).toHaveTextContent(/60,000/);
    expect(statValue("Contracted Rent")).toHaveTextContent(/55,000/);
    expect(statValue("Billed")).toHaveTextContent(/50,000/);
    expect(statValue("Billed")).toHaveTextContent(/3 invoices/);
    // Collection rate is collected / billed.
    expect(statValue("Collected")).toHaveTextContent(/25,000/);
    expect(statValue("Collected")).toHaveTextContent(/50% of billed/);
    expect(statValue("Outstanding")).toHaveTextContent(/25,000/);
    expect(statValue("Outstanding")).toHaveTextContent(/2 open/);
  });

  it("requests the selected period from the amounts and invoice hooks", async () => {
    renderManager();

    expect(mocks.useAmounts).toHaveBeenCalledWith({ period: currentPeriod() });
    expect(mocks.useStaffInvoices).toHaveBeenCalledWith({ period: currentPeriod() });

    fireEvent.change(screen.getByDisplayValue(currentPeriod()), {
      target: { value: "2026-01" },
    });

    await waitFor(() => expect(mocks.useAmounts).toHaveBeenLastCalledWith({ period: "2026-01" }));
    expect(mocks.useStaffInvoices).toHaveBeenLastCalledWith({ period: "2026-01" });
  });

  it("switches the period when a history row is clicked", async () => {
    const user = userEvent.setup();
    mocks.state.amounts = makeAmounts({
      byPeriod: [{ period: "2026-08", billed: 40000, collected: 30000, open: 1, count: 2 }],
    });
    renderManager();

    await user.click(screen.getByText("Aug 2026"));

    await waitFor(() => expect(mocks.useAmounts).toHaveBeenLastCalledWith({ period: "2026-08" }));
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

  it("filters invoices by the search box", async () => {
    mocks.invoices.push(
      makeInvoice({ _id: "inv-a", invoiceNumber: "INV-202601-0001" }),
      makeInvoice({ _id: "inv-b", invoiceNumber: "INV-202602-0002" }),
    );
    renderManager();

    await userEvent.type(screen.getByPlaceholderText("Search invoices…"), "202602");

    expect(screen.getByText("INV-202602-0002")).toBeInTheDocument();
    expect(screen.queryByText("INV-202601-0001")).not.toBeInTheDocument();
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
    mocks.state.loading = true;
    renderManager();
    expect(screen.getByText(/loading invoices/i)).toBeInTheDocument();
  });

  it("renders an error state", () => {
    mocks.state.error = "Failed to fetch invoices";
    renderManager();
    expect(screen.getByText("Failed to fetch invoices")).toBeInTheDocument();
  });

  it("renders the empty state", () => {
    renderManager();
    expect(screen.getByText("No invoices here")).toBeInTheDocument();
  });
});
