import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InvoiceTable } from "@/components/invoices/InvoiceTable";
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
    amountPaid: 0,
    status: "pending",
    overdue: false,
    dueDate: "2026-11-05T00:00:00.000Z",
    issuedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("InvoiceTable", () => {
  it("shows the payment reference when one is recorded", () => {
    render(<InvoiceTable invoices={[makeInvoice({ paymentReference: "QK12ABC3XY" })]} />);
    expect(screen.getByText(/QK12ABC3XY/)).toBeInTheDocument();
  });

  it("shows the amount received for a partially paid invoice", () => {
    render(
      <InvoiceTable
        invoices={[makeInvoice({ amountDue: 15000, amountPaid: 5000, status: "pending" })]}
      />,
    );
    expect(screen.getByText(/received/i)).toBeInTheDocument();
  });

  it("shows the rent and service fee split when a separate service fee is billed", () => {
    render(
      <InvoiceTable
        invoices={[makeInvoice({ amountDue: 15000, rentAmount: 12000, serviceChargeAmount: 3000 })]}
      />,
    );

    expect(screen.getByText(/Rent/i)).toBeInTheDocument();
    expect(screen.getByText(/Service fee/i)).toBeInTheDocument();
    expect(screen.getByText(/Ksh 12,000/)).toBeInTheDocument();
    expect(screen.getByText(/Ksh 3,000/)).toBeInTheDocument();
  });

  it("does not show a received hint for an unpaid invoice", () => {
    render(<InvoiceTable invoices={[makeInvoice({ amountPaid: 0 })]} />);
    expect(screen.queryByText(/received/i)).not.toBeInTheDocument();
  });
});
