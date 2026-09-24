"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatKES, formatPeriod } from "@/lib/format";
import type { DerivedInvoiceStatus } from "@/lib/invoicing";
import type { Invoice } from "@/types/invoicing";

const statusClass: Record<DerivedInvoiceStatus, string> = {
  paid: "bg-success/15 text-success",
  pending: "bg-warning/15 text-warning",
  overdue: "bg-destructive/15 text-destructive",
  draft: "bg-muted text-muted-foreground",
  void: "bg-muted text-muted-foreground",
};

interface InvoiceTableProps {
  invoices: Invoice[];
  /** Maps a tenant id to its display name; falls back to the raw id when absent. */
  tenantNames?: Record<string, string>;
  /** Per-row action slot rendered in the trailing column. */
  renderActions?: (invoice: Invoice) => ReactNode;
}

export const InvoiceTable = ({ invoices, tenantNames, renderActions }: InvoiceTableProps) => {
  if (invoices.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice</TableHead>
            <TableHead>Tenant</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Due</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => (
            <TableRow key={invoice._id}>
              <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
              <TableCell>
                <p className="font-medium">{tenantNames?.[invoice.tenantId] ?? invoice.tenantId}</p>
                <p className="text-xs text-muted-foreground">{formatPeriod(invoice.period)}</p>
              </TableCell>
              <TableCell className="font-medium">{formatKES(invoice.amountDue)}</TableCell>
              <TableCell className="text-muted-foreground">{formatDate(invoice.dueDate)}</TableCell>
              <TableCell>
                <Badge className={`${statusClass[invoice.status]} capitalize hover:opacity-100`}>
                  {invoice.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{renderActions?.(invoice)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
