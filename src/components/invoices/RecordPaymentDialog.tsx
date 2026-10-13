"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatPeriod } from "@/lib/format";
import { INVOICE_METHODS, type InvoiceMethod } from "@/lib/invoicing";
import type { InvoiceMarkPaidInput } from "@/lib/schemas";
import type { Invoice } from "@/types/invoicing";

const toLocalDateInput = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice | null;
  pending: boolean;
  onSubmit: (id: string, input: InvoiceMarkPaidInput) => Promise<void>;
}

export const RecordPaymentDialog = ({
  open,
  onOpenChange,
  invoice,
  pending,
  onSubmit,
}: RecordPaymentDialogProps) => {
  const [method, setMethod] = useState<InvoiceMethod>("M-Pesa");
  const [amount, setAmount] = useState("");
  const [paidDate, setPaidDate] = useState(() => toLocalDateInput(new Date()));
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setMethod(invoice?.method ?? "M-Pesa");
      setAmount(invoice ? String(invoice.amountDue) : "");
      setPaidDate(toLocalDateInput(new Date()));
      setDescription("");
      setReference("");
      setNotes(invoice?.notes ?? "");
    }
  }, [open, invoice]);

  const handleSubmit = async () => {
    if (!invoice) return;
    try {
      const parsedAmount = Number(amount);
      await onSubmit(invoice._id, {
        method,
        amount: Number.isFinite(parsedAmount) && amount.trim() !== "" ? parsedAmount : undefined,
        paidAt: paidDate ? new Date(`${paidDate}T00:00:00`).toISOString() : undefined,
        description: description.trim() || undefined,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });
    } catch {
      // the parent has already surfaced the failure via toast
    }
  };

  const showReferenceHint =
    method === "M-Pesa" || method === "Card" || method === "Bank" || method === "Other";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {invoice
              ? `Mark ${invoice.invoiceNumber} as paid (${formatPeriod(invoice.period)}).`
              : "Mark this invoice as paid."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="payment-amount">Amount</Label>
            <Input
              id="payment-amount"
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Payment method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as InvoiceMethod)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVOICE_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment-date">Date</Label>
            <Input
              id="payment-date"
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment-description">Description (optional)</Label>
            <Textarea
              id="payment-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment-reference">Reference (optional)</Label>
            <Input
              id="payment-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
            {showReferenceHint && (
              <p className="text-xs text-muted-foreground">
                Enter the {method} transaction reference, e.g. the M-Pesa confirmation code.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment-notes">Notes</Label>
            <Textarea
              id="payment-notes"
              rows={2}
              placeholder="Optional notes about this payment…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            className="rounded-full"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button className="rounded-full" disabled={pending} onClick={handleSubmit}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
