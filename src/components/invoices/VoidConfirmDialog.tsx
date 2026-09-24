"use client";

import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { Invoice } from "@/types/invoicing";

interface VoidConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice | null;
  pending: boolean;
  onConfirm: (id: string) => Promise<void>;
}

export const VoidConfirmDialog = ({
  open,
  onOpenChange,
  invoice,
  pending,
  onConfirm,
}: VoidConfirmDialogProps) => {
  const handleConfirm = async () => {
    if (!invoice) return;
    try {
      await onConfirm(invoice._id);
    } catch {
      // the parent has already surfaced the failure via toast
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending && !next) onOpenChange(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Void {invoice?.invoiceNumber ?? "this invoice"}?</AlertDialogTitle>
          <AlertDialogDescription>
            Voiding removes the invoice from billing and cannot be undone. Paid invoices cannot be
            voided.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={handleConfirm}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Void invoice
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
