"use client";

import {
  Banknote,
  CalendarPlus,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  Loader2,
  Plus,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { StatCard } from "@/components/StatCard";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DashNavItem } from "@/config/dashboardNav";
import { useInvoiceMutations, useStaffInvoices } from "@/hooks/use-invoices";
import { formatKES, formatPeriod } from "@/lib/format";
import type { InvoiceInput, InvoiceMarkPaidInput, InvoiceUpdate } from "@/lib/schemas";
import type { Invoice } from "@/types/invoicing";
import { GenerateMonthDialog } from "./GenerateMonthDialog";
import { InvoiceFormDialog } from "./InvoiceFormDialog";
import { InvoiceTable } from "./InvoiceTable";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { VoidConfirmDialog } from "./VoidConfirmDialog";

type StatusTab = "all" | "pending" | "overdue" | "paid" | "draft" | "void";

interface InvoicesManagerProps {
  nav: DashNavItem[];
  roleName: string;
  canManage: boolean;
  isStaffScope?: boolean;
  tenantScope?: boolean;
  tenantNames?: Record<string, string>;
}

export const InvoicesManager = (props: InvoicesManagerProps) => {
  const { canManage, roleName, tenantNames } = props;
  const { invoices, loading, error, refetch } = useStaffInvoices();
  const { createInvoice, updateInvoice, markPaid, voidInvoice, deleteInvoice, generate, pending } =
    useInvoiceMutations();

  const [tab, setTab] = useState<StatusTab>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [recording, setRecording] = useState<Invoice | null>(null);
  const [voiding, setVoiding] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState<Invoice | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);

  const counts: Record<StatusTab, number> = {
    all: invoices.length,
    pending: invoices.filter((i) => i.status === "pending").length,
    overdue: invoices.filter((i) => i.status === "overdue").length,
    paid: invoices.filter((i) => i.status === "paid").length,
    draft: invoices.filter((i) => i.status === "draft").length,
    void: invoices.filter((i) => i.status === "void").length,
  };

  const visible = useMemo(
    () => (tab === "all" ? invoices : invoices.filter((i) => i.status === tab)),
    [invoices, tab],
  );

  const billed = invoices
    .filter((i) => i.status !== "void")
    .reduce((sum, i) => sum + i.amountDue, 0);
  const collected = invoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + i.amountDue, 0);
  const outstanding = invoices
    .filter((i) => i.status === "pending" || i.status === "overdue")
    .reduce((sum, i) => sum + i.amountDue, 0);
  const openCount = invoices.filter((i) => i.status === "pending" || i.status === "overdue").length;
  const collectionRate = billed > 0 ? Math.round((collected / billed) * 100) : 0;

  const byPeriod = useMemo(() => {
    const map = new Map<string, { billed: number; collected: number }>();
    for (const invoice of invoices) {
      if (invoice.status === "void") continue;
      const entry = map.get(invoice.period) ?? { billed: 0, collected: 0 };
      entry.billed += invoice.amountDue;
      if (invoice.status === "paid") entry.collected += invoice.amountDue;
      map.set(invoice.period, entry);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [invoices]);

  const latest = byPeriod[0];

  const openCreate = () => {
    setEditing(null);
    setCreateOpen(true);
  };

  const openEdit = (invoice: Invoice) => {
    setEditing(invoice);
    setCreateOpen(true);
  };

  const handleSubmitInvoice = async (
    input: InvoiceInput | InvoiceUpdate,
    editingInvoice?: Invoice | null,
  ) => {
    try {
      if (editingInvoice) {
        await updateInvoice(editingInvoice._id, input);
        toast.success("Invoice updated", {
          description: `${editingInvoice.invoiceNumber} was saved.`,
        });
      } else {
        await createInvoice(input);
        toast.success("Invoice created", {
          description: "The invoice has been issued.",
        });
      }
      setCreateOpen(false);
      refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast.error(editingInvoice ? "Could not update invoice" : "Could not create invoice", {
        description: message,
      });
    }
  };

  const handleMarkPaid = async (id: string, input: InvoiceMarkPaidInput) => {
    try {
      await markPaid(id, input);
      toast.success("Payment recorded", {
        description: `Invoice settled via ${input.method ?? "the recorded method"}.`,
      });
      setRecording(null);
      refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast.error("Could not record payment", { description: message });
    }
  };

  const handleVoid = async (id: string) => {
    try {
      await voidInvoice(id);
      toast.success("Invoice voided", {
        description: "The invoice was removed from billing.",
      });
      setVoiding(null);
      refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast.error("Could not void invoice", { description: message });
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteInvoice(deleting._id);
      toast.success("Draft deleted", {
        description: `${deleting.invoiceNumber} was removed.`,
      });
      setDeleting(null);
      refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete invoice";
      toast.error("Could not delete draft", { description: message });
    }
  };

  const handleGenerate = async (period: string) => {
    try {
      const result = await generate(period);
      toast.success("Invoices generated", {
        description: `${result.created} created, ${result.skipped} skipped for ${formatPeriod(period)}.`,
      });
      setGenerateOpen(false);
      refetch();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast.error("Could not generate invoices", { description: message });
      throw err;
    }
  };

  const renderActions = (invoice: Invoice) => {
    if (invoice.status === "paid") {
      return <span className="text-xs text-muted-foreground">{invoice.method ?? "Paid"}</span>;
    }
    if (invoice.status === "void") {
      return <span className="text-xs text-muted-foreground">Voided</span>;
    }
    return (
      <div className="flex justify-end gap-2">
        {canManage && invoice.status === "draft" && (
          <>
            <Button size="sm" variant="outline" onClick={() => openEdit(invoice)}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleting(invoice)}
            >
              Delete
            </Button>
          </>
        )}
        {canManage && (
          <Button size="sm" className="rounded-full" onClick={() => setRecording(invoice)}>
            <Plus className="h-4 w-4" />
            Record
          </Button>
        )}
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => setVoiding(invoice)}>
            Void
          </Button>
        )}
      </div>
    );
  };

  const canCreate = canManage && roleName !== "Caretaker";

  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Billed" value={formatKES(billed)} icon={Banknote} />
        <StatCard
          label="Collected"
          value={formatKES(collected)}
          hint={`${collectionRate}% collection rate`}
          icon={CheckCircle2}
        />
        <StatCard
          label="Outstanding"
          value={formatKES(outstanding)}
          hint={`${openCount} open`}
          icon={Clock}
        />
        <StatCard
          label="This month"
          value={latest ? formatKES(latest[1].collected) : "—"}
          hint={latest ? formatPeriod(latest[0]) : "No billing yet"}
          icon={TrendingUp}
        />
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as StatusTab)}>
          <TabsList>
            {(["all", "pending", "overdue", "paid", "draft", "void"] as const).map((t) => (
              <TabsTrigger key={t} value={t} className="capitalize">
                {t}
                <span className="ml-1.5 text-xs text-muted-foreground">{counts[t]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-3">
          {canCreate && (
            <Button className="rounded-full" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Create invoice
            </Button>
          )}
          {canManage && (
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => setGenerateOpen(true)}
            >
              <CalendarPlus className="h-4 w-4" />
              Generate month
            </Button>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
          <h3 className="font-display text-lg font-semibold">Invoices</h3>
          <div className="mt-4">
            {loading ? (
              <p className="text-muted-foreground">Loading invoices…</p>
            ) : error ? (
              <p className="text-destructive">{error}</p>
            ) : visible.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
                <CircleDollarSign className="mx-auto h-8 w-8 text-muted-foreground" />
                <h3 className="mt-3 font-display text-xl">No invoices here</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Nothing matches this view. Try another status or generate a month.
                </p>
              </div>
            ) : (
              <InvoiceTable
                invoices={visible}
                tenantNames={tenantNames}
                renderActions={renderActions}
              />
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h3 className="font-display text-lg font-semibold">By billing period</h3>
          <dl className="mt-4 space-y-3 text-sm">
            {byPeriod.length === 0 && <p className="text-muted-foreground">No data yet.</p>}
            {byPeriod.map(([period, sums]) => (
              <div
                key={period}
                className="flex items-center justify-between border-b border-border pb-2 last:border-0"
              >
                <div>
                  <p className="font-medium">{formatPeriod(period)}</p>
                  <p className="text-xs text-muted-foreground">
                    {Math.round((sums.collected / Math.max(sums.billed, 1)) * 100)}% collected
                  </p>
                </div>
                <p className="font-medium">{formatKES(sums.collected)}</p>
              </div>
            ))}
          </dl>
        </section>
      </div>

      {createOpen && (
        <InvoiceFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          invoice={editing}
          pending={pending}
          onSubmit={handleSubmitInvoice}
        />
      )}

      <RecordPaymentDialog
        open={recording !== null}
        onOpenChange={(next) => {
          if (!next) setRecording(null);
        }}
        invoice={recording}
        pending={pending}
        onSubmit={handleMarkPaid}
      />

      <VoidConfirmDialog
        open={voiding !== null}
        onOpenChange={(next) => {
          if (!next) setVoiding(null);
        }}
        invoice={voiding}
        pending={pending}
        onConfirm={handleVoid}
      />

      <GenerateMonthDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        pending={pending}
        onSubmit={handleGenerate}
      />

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!pending && !next) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.invoiceNumber ?? "this draft"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Only draft invoices can be deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={pending} onClick={handleDelete}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete draft
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
