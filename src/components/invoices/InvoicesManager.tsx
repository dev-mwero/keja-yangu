"use client";

import {
  Banknote,
  Building2,
  CalendarPlus,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  Loader2,
  Plus,
  Receipt,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SearchInput } from "@/components/SearchInput";
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
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DashNavItem } from "@/config/dashboardNav";
import { useAmounts } from "@/hooks/use-amounts";
import { useInvoiceMutations, useStaffInvoices } from "@/hooks/use-invoices";
import { formatKES, formatPeriod } from "@/lib/format";
import { currentPeriod } from "@/lib/invoicing";
import type { InvoiceInput, InvoiceMarkPaidInput, InvoiceUpdate } from "@/lib/schemas";
import { matchesQuery } from "@/lib/search";
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
  const [period, setPeriod] = useState(currentPeriod());
  const { invoices, loading, error, refetch } = useStaffInvoices({ period });
  const { amounts, loading: amountsLoading, error: amountsError } = useAmounts({ period });
  const { createInvoice, updateInvoice, markPaid, voidInvoice, deleteInvoice, generate, pending } =
    useInvoiceMutations();

  const [tab, setTab] = useState<StatusTab>("all");
  const [query, setQuery] = useState("");
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
    () =>
      invoices
        .filter((i) => tab === "all" || i.status === tab)
        .filter((i) =>
          matchesQuery(query, i.invoiceNumber, i.period, i.status, tenantNames?.[i.tenantId]),
        ),
    [invoices, tab, query, tenantNames],
  );

  const billed = amounts.rentBilled;
  const collected = amounts.rentCollected;
  const outstanding = amounts.rentOutstanding;
  const openCount = amounts.openInvoiceCount;
  const collectionRate = billed > 0 ? Math.round((collected / billed) * 100) : 0;
  const byPeriod = amounts.byPeriod;
  const statsLoading = amountsLoading;

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
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="space-y-1.5">
          <div className="text-sm font-medium text-muted-foreground">Rent period</div>
          <Input
            type="month"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            className="w-44"
          />
        </div>
        <p className="max-w-md text-xs text-muted-foreground">
          Contracted, billed, collected and outstanding are for {formatPeriod(period)}. Potential
          and occupied rent are current monthly snapshots.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Potential Monthly Rent"
          value={statsLoading ? "…" : formatKES(amounts.potentialMonthlyRent)}
          hint="Rent if all rentable units were occupied"
          icon={Banknote}
        />
        <StatCard
          label="Occupied Monthly Rent"
          value={statsLoading ? "…" : formatKES(amounts.occupiedMonthlyRent)}
          hint={`${amounts.occupiedUnitCount} occupied units · current rent settings`}
          icon={Building2}
        />
        <StatCard
          label="Contracted Rent"
          value={statsLoading ? "…" : formatKES(amounts.contractedRent)}
          hint={`${formatPeriod(period)} · active leases, prorated`}
          icon={Receipt}
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <StatCard
          label="Billed"
          value={statsLoading ? "…" : formatKES(billed)}
          hint={`${amounts.invoiceCount} invoices for ${formatPeriod(period)}`}
          icon={Banknote}
        />
        <StatCard
          label="Collected"
          value={statsLoading ? "…" : formatKES(collected)}
          hint={`${collectionRate}% of billed`}
          icon={CheckCircle2}
        />
        <StatCard
          label="Outstanding"
          value={statsLoading ? "…" : formatKES(outstanding)}
          hint={`${openCount} open`}
          icon={Clock}
        />
      </div>

      {amountsError && (
        <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {amountsError}
        </p>
      )}

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
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search invoices…"
            className="w-full sm:w-56"
          />
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
          <h3 className="font-display text-lg font-semibold">
            Invoices for {formatPeriod(period)}
          </h3>
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
                  Nothing matches this view. Try another status, period or generate a month.
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
          <h3 className="font-display text-lg font-semibold">Payments by rent period</h3>
          <div className="mt-4 space-y-3 text-sm">
            {byPeriod.length === 0 && <p className="text-muted-foreground">No data yet.</p>}
            {byPeriod.map((row) => (
              <button
                key={row.period}
                type="button"
                onClick={() => setPeriod(row.period)}
                className={`flex w-full items-center justify-between border-b border-border pb-2 text-left last:border-0 ${
                  row.period === period ? "text-primary" : ""
                }`}
              >
                <div>
                  <p className="font-medium">{formatPeriod(row.period)}</p>
                  <p className="text-xs text-muted-foreground">
                    {Math.round((row.collected / Math.max(row.billed, 1)) * 100)}% of billed ·{" "}
                    {row.open} open
                  </p>
                </div>
                <p className="font-medium">{formatKES(row.collected)}</p>
              </button>
            ))}
          </div>
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
