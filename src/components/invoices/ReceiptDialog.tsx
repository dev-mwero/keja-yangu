"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { formatDate, formatKES, formatPeriod } from "@/lib/format";
import type { Invoice } from "@/types/invoicing";

interface ReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice | null;
}

export const ReceiptDialog = ({ open, onOpenChange, invoice }: ReceiptDialogProps) => {
  const { user } = useAuth();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receipt</DialogTitle>
        </DialogHeader>
        {invoice && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Invoice</span>
              <span className="font-medium">{invoice.invoiceNumber}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Period</span>
              <span className="font-medium">{formatPeriod(invoice.period)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tenant</span>
              <span className="font-medium">{user?.name ?? invoice.tenantId}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-medium">{formatKES(invoice.amountDue)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Paid</span>
              <span>{invoice.paidAt ? formatDate(invoice.paidAt) : "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Method</span>
              <span>{invoice.method ?? "—"}</span>
            </div>
            {invoice.notes && (
              <div className="flex items-start justify-between gap-6">
                <span className="text-muted-foreground">Notes</span>
                <span className="text-right">{invoice.notes}</span>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button className="rounded-full" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
