import type { DerivedInvoiceStatus, InvoiceMethod } from "@/lib/invoicing";

/**
 * Serialized invoice as returned by the invoicing API. `status` carries the
 * derived `"overdue"` value (the server never persists it) and `overdue` is
 * always present. Dates arrive as ISO strings via JSON.
 */
export interface Invoice {
  _id: string;
  invoiceNumber: string;
  tenantId: string;
  propertyId: string;
  leaseId: string;
  ownerId: string;
  period: string;
  amountDue: number;
  amountPaid: number;
  status: DerivedInvoiceStatus;
  dueDate: string;
  issuedAt: string;
  paidAt?: string;
  method?: InvoiceMethod;
  notes?: string;
  paidBy?: string;
  paidByRole?: string;
  overdue: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Lease as returned by `/api/v1/leases`. Dates are ISO strings after JSON. */
export interface Lease {
  _id: string;
  tenantId: string;
  propertyId: string;
  ownerId: string;
  rentAmount: number;
  frequency: "monthly";
  startDate: string;
  endDate?: string | null;
  status: "active" | "ended";
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}
