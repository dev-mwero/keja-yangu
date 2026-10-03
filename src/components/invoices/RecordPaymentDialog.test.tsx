import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Invoice } from "@/types/invoicing";

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

const { RecordPaymentDialog } = await import("@/components/invoices/RecordPaymentDialog");

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    _id: "inv-1",
    invoiceNumber: "INV-202610-0001",
    tenantId: "tenant-1",
    propertyId: "prop-1",
    leaseId: "lease-1",
    ownerId: "owner-1",
    period: "2026-10",
    amountDue: 15000,
    amountPaid: 0,
    status: "pending",
    overdue: false,
    dueDate: "2026-11-05T00:00:00.000Z",
    issuedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("RecordPaymentDialog", () => {
  it("renders amount, method, date, description, reference and notes fields", () => {
    render(
      <RecordPaymentDialog
        open
        onOpenChange={() => {}}
        invoice={makeInvoice()}
        pending={false}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/Amount/i)).toHaveValue(15000);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByLabelText(/Date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Reference/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Notes/i)).toBeInTheDocument();
  });

  it("shows the reference hint for M-Pesa and hides it for Cash", async () => {
    const user = userEvent.setup();
    render(
      <RecordPaymentDialog
        open
        onOpenChange={() => {}}
        invoice={makeInvoice()}
        pending={false}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText(/transaction reference/i)).toBeInTheDocument();
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Cash" }));
    expect(screen.queryByText(/transaction reference/i)).not.toBeInTheDocument();
  });

  it("submits the extended payload", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <RecordPaymentDialog
        open
        onOpenChange={() => {}}
        invoice={makeInvoice()}
        pending={false}
        onSubmit={onSubmit}
      />,
    );
    const amountInput = screen.getByLabelText(/Amount/i);
    await user.clear(amountInput);
    await user.type(amountInput, "12500");
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Bank" }));
    await user.type(screen.getByLabelText(/Description/i), "October rent");
    await user.type(screen.getByLabelText(/Reference/i), "BNK-42");
    await user.click(screen.getByRole("button", { name: /Record payment/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith("inv-1", {
      method: "Bank",
      amount: 12500,
      paidAt: expect.any(String),
      description: "October rent",
      reference: "BNK-42",
      notes: undefined,
    });
  });
});
