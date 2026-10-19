import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReceiptDialog } from "@/components/invoices/ReceiptDialog";
import type { Invoice } from "@/types/invoicing";

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
    amountPaid: 15000,
    status: "paid",
    overdue: false,
    dueDate: "2026-11-05T00:00:00.000Z",
    issuedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("ReceiptDialog", () => {
  it("shows the method, reference and description of a recorded payment", () => {
    render(
      <ReceiptDialog
        open
        onOpenChange={vi.fn()}
        invoice={makeInvoice({
          method: "Bank",
          paymentReference: "BNK-42",
          paymentDescription: "October rent",
        })}
      />,
    );
    expect(screen.getByText("Bank")).toBeInTheDocument();
    expect(screen.getByText("BNK-42")).toBeInTheDocument();
    expect(screen.getByText("October rent")).toBeInTheDocument();
  });

  it("omits the reference and description rows when there are none", () => {
    render(<ReceiptDialog open onOpenChange={vi.fn()} invoice={makeInvoice()} />);
    expect(screen.queryByText(/Reference/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Description/i)).not.toBeInTheDocument();
  });
});
