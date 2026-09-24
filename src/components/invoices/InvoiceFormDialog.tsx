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
import { useLeases } from "@/hooks/use-leases";
import { useProperties } from "@/hooks/use-properties";
import { useTenants } from "@/hooks/use-tenants";
import { formatKES, formatPeriod } from "@/lib/format";
import { INVOICE_METHODS, type InvoiceMethod } from "@/lib/invoicing";
import type { InvoiceInput, InvoiceUpdate } from "@/lib/schemas";
import type { Invoice } from "@/types/invoicing";

type FormMode = "lease" | "manual";

interface FormState {
  mode: FormMode;
  leaseId: string;
  tenantId: string;
  propertyId: string;
  amountDue: string;
  status: "draft" | "pending";
  method: InvoiceMethod | "none";
  notes: string;
}

const emptyForm: FormState = {
  mode: "lease",
  leaseId: "",
  tenantId: "",
  propertyId: "",
  amountDue: "",
  status: "pending",
  method: "none",
  notes: "",
};

interface FormErrors {
  leaseId?: string;
  tenantId?: string;
  propertyId?: string;
  amountDue?: string;
}

interface InvoiceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice?: Invoice | null;
  pending: boolean;
  onSubmit: (input: InvoiceInput | InvoiceUpdate, editing?: Invoice | null) => Promise<void>;
}

export const InvoiceFormDialog = ({
  open,
  onOpenChange,
  invoice,
  pending,
  onSubmit,
}: InvoiceFormDialogProps) => {
  const { leases } = useLeases();
  const { tenants } = useTenants();
  const { properties } = useProperties();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  const editing = invoice != null;

  useEffect(() => {
    if (!open) return;
    if (editing && invoice) {
      setForm({
        mode: invoice.leaseId ? "lease" : "manual",
        leaseId: invoice.leaseId,
        tenantId: invoice.tenantId,
        propertyId: invoice.propertyId,
        amountDue: String(invoice.amountDue),
        status: invoice.status === "draft" ? "draft" : "pending",
        method: invoice.method ?? "none",
        notes: invoice.notes ?? "",
      });
    } else {
      setForm(emptyForm);
    }
    setFormErrors({});
  }, [editing, invoice, open]);

  const tenantNames = new Map(tenants.map((t) => [t._id, t.name]));
  const propertyTitles = new Map(properties.map((p) => [p._id, p.title]));

  const leaseLabel = (leaseId: string): string => {
    const lease = leases.find((l) => l._id === leaseId);
    if (!lease) return leaseId;
    const tenant = tenantNames.get(lease.tenantId) ?? lease.tenantId;
    const property = propertyTitles.get(lease.propertyId) ?? lease.propertyId;
    return `${tenant} · ${property} · ${formatKES(lease.rentAmount)}`;
  };

  const validate = (): boolean => {
    const next: FormErrors = {};
    if (!editing) {
      if (form.mode === "lease") {
        if (!form.leaseId) next.leaseId = "Select a lease";
      } else {
        if (!form.tenantId) next.tenantId = "Select a tenant";
        if (!form.propertyId) next.propertyId = "Select a property";
        if (form.amountDue === "" || Number(form.amountDue) <= 0) {
          next.amountDue = "Enter a positive amount";
        }
      }
    } else if (form.amountDue === "" || Number(form.amountDue) <= 0) {
      next.amountDue = "Enter a positive amount";
    }
    setFormErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    const method = form.method === "none" ? undefined : form.method;
    const notes = form.notes.trim() || undefined;
    try {
      if (editing) {
        await onSubmit(
          {
            status: form.status,
            amountDue: Number(form.amountDue),
            method,
            notes,
          },
          invoice,
        );
      } else if (form.mode === "lease") {
        await onSubmit({
          leaseId: form.leaseId,
          status: form.status,
          method,
          notes,
        });
      } else {
        await onSubmit({
          tenantId: form.tenantId,
          propertyId: form.propertyId,
          amountDue: Number(form.amountDue),
          status: form.status,
          method,
          notes,
        });
      }
    } catch {
      // the parent has already surfaced the failure via toast
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit invoice" : "Create invoice"}</DialogTitle>
          <DialogDescription>
            {editing
              ? `Update ${invoice?.invoiceNumber} (${invoice ? formatPeriod(invoice.period) : ""}).`
              : "Issue a new invoice for a lease or a tenant."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!editing && (
            <div className="space-y-2">
              <Label>Source</Label>
              <Select
                value={form.mode}
                onValueChange={(v) => setForm({ ...form, mode: v as FormMode })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lease">From lease (rent amount)</SelectItem>
                  <SelectItem value="manual">Manual (tenant + property)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {!editing && form.mode === "lease" && (
            <div className="space-y-2">
              <Label>Lease</Label>
              <Select value={form.leaseId} onValueChange={(v) => setForm({ ...form, leaseId: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an active lease" />
                </SelectTrigger>
                <SelectContent>
                  {leases
                    .filter((l) => l.status === "active")
                    .map((l) => (
                      <SelectItem key={l._id} value={l._id}>
                        {leaseLabel(l._id)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {formErrors.leaseId && (
                <p className="text-xs text-destructive">{formErrors.leaseId}</p>
              )}
            </div>
          )}

          {!editing && form.mode === "manual" && (
            <>
              <div className="space-y-2">
                <Label>Tenant</Label>
                <Select
                  value={form.tenantId}
                  onValueChange={(v) => setForm({ ...form, tenantId: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    {tenants.map((t) => (
                      <SelectItem key={t._id} value={t._id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErrors.tenantId && (
                  <p className="text-xs text-destructive">{formErrors.tenantId}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Property</Label>
                  <Select
                    value={form.propertyId}
                    onValueChange={(v) => setForm({ ...form, propertyId: v })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select property" />
                    </SelectTrigger>
                    <SelectContent>
                      {properties.map((p) => (
                        <SelectItem key={p._id} value={p._id}>
                          {p.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formErrors.propertyId && (
                    <p className="text-xs text-destructive">{formErrors.propertyId}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Amount (KES)</Label>
                  <Input
                    id="invoice-amount"
                    type="number"
                    min={0}
                    value={form.amountDue}
                    onChange={(e) => setForm({ ...form, amountDue: e.target.value })}
                  />
                  {formErrors.amountDue && (
                    <p className="text-xs text-destructive">{formErrors.amountDue}</p>
                  )}
                </div>
              </div>
            </>
          )}

          {editing && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount (KES)</Label>
                <Input
                  id="invoice-amount"
                  type="number"
                  min={0}
                  value={form.amountDue}
                  onChange={(e) => setForm({ ...form, amountDue: e.target.value })}
                />
                {formErrors.amountDue && (
                  <p className="text-xs text-destructive">{formErrors.amountDue}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v as "draft" | "pending" })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {!editing && (
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as "draft" | "pending" })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Payment method</Label>
            <Select
              value={form.method}
              onValueChange={(v) => setForm({ ...form, method: v as InvoiceMethod | "none" })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                {INVOICE_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoice-notes">Notes</Label>
            <Textarea
              id="invoice-notes"
              rows={2}
              placeholder="Optional notes…"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
            {editing ? "Save changes" : "Create invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
