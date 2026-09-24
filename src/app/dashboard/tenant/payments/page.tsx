"use client";

import { CheckCircle2, CreditCard, Download, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/DashboardShell";
import { ReceiptDialog } from "@/components/invoices/ReceiptDialog";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { tenantNav } from "@/config/dashboardNav";
import { useMyInvoiceMutations, useMyInvoices } from "@/hooks/use-my-invoices";
import { formatKES, formatPeriod } from "@/lib/format";
import type { DerivedInvoiceStatus } from "@/lib/invoicing";
import { INVOICE_METHODS, type InvoiceMethod } from "@/lib/invoicing";
import type { Invoice } from "@/types/invoicing";

const statusClass: Record<DerivedInvoiceStatus, string> = {
  paid: "bg-success/15 text-success",
  pending: "bg-warning/15 text-warning",
  overdue: "bg-destructive/15 text-destructive",
  draft: "bg-muted text-muted-foreground",
  void: "bg-muted text-muted-foreground",
};

type Tab = "upcoming" | "history";

const TenantPaymentsPage = () => {
  const { invoices, refetch } = useMyInvoices();
  const { markOwnPaid, initiatePay, checkPaymentReference, pending } = useMyInvoiceMutations();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [method, setMethod] = useState<InvoiceMethod>("M-Pesa");
  const [receipt, setReceipt] = useState<Invoice | null>(null);

  // Callback return: the "Pay online" flow redirects the browser to Paystack
  // and back to this page with ?reference=<id>. Verify server-side (the
  // webhook may have lost the round-trip) and toast the outcome, then strip
  // the query params so a refresh/re-share does not re-verify.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference");
    if (!reference) return;
    void (async () => {
      try {
        const result = await checkPaymentReference(reference);
        if (result.invoice?.status === "paid") {
          toast.success("Payment confirmed", {
            description: "Your bill has been settled. Thank you!",
          });
          refetch();
        } else {
          toast.error("Payment not confirmed yet", {
            description: "We could not confirm your payment — it may still be processing.",
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong";
        toast.error("Could not verify payment", { description: message });
      } finally {
        window.history.replaceState({}, "", window.location.pathname);
      }
    })();
  }, [checkPaymentReference, refetch]);

  const upcoming = useMemo(
    () => invoices.filter((i) => i.status === "pending" || i.status === "overdue"),
    [invoices],
  );
  const history = useMemo(() => invoices.filter((i) => i.status === "paid"), [invoices]);
  const paidTotal = history.reduce((sum, i) => sum + i.amountDue, 0);
  const nextDue = upcoming.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  const rows = tab === "history" ? history : upcoming;

  const confirmPayment = async () => {
    if (!paying) return;
    try {
      await markOwnPaid(paying._id, { method });
      toast.success("Payment recorded", {
        description: `${paying.invoiceNumber} settled via ${method}.`,
      });
      setPaying(null);
      refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast.error("Could not mark invoice as paid", { description: message });
    }
  };

  const handlePayOnline = async (invoice: Invoice) => {
    try {
      await initiatePay(invoice._id);
      // initiatePay redirects the browser to the Paystack checkout on success.
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast.error("Could not start online payment", { description: message });
    }
  };

  return (
    <DashboardShell
      roleName="Tenant"
      nav={tenantNav}
      title="Payments"
      subtitle="Track your rent and bills, and settle them offline."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <StatCard
          label="Next payment"
          value={nextDue ? formatKES(nextDue.amountDue) : "—"}
          hint={
            nextDue ? `${formatPeriod(nextDue.period)} · ${nextDue.invoiceNumber}` : "Nothing due"
          }
          icon={Wallet}
        />
        <StatCard label="Paid to date" value={formatKES(paidTotal)} icon={CheckCircle2} />
      </div>

      <div className="mt-8">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="mt-6">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
            <Wallet className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 font-display text-xl">Nothing here</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {tab === "history" ? "You have no past payments yet." : "All bills are settled."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((invoice) => (
                  <TableRow key={invoice._id}>
                    <TableCell>
                      <p className="font-medium">{formatPeriod(invoice.period)}</p>
                      <p className="text-xs text-muted-foreground">{invoice.invoiceNumber}</p>
                    </TableCell>
                    <TableCell className="font-medium">{formatKES(invoice.amountDue)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(invoice.dueDate).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`${statusClass[invoice.status]} capitalize hover:opacity-100`}
                      >
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {invoice.status === "paid" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-full text-muted-foreground"
                          onClick={() => setReceipt(invoice)}
                        >
                          <Download className="h-4 w-4" />
                          Receipt
                        </Button>
                      ) : invoice.amountPaid === 0 &&
                        (invoice.status === "pending" || invoice.status === "overdue") ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            className="rounded-full"
                            disabled={pending}
                            onClick={() => {
                              void handlePayOnline(invoice);
                            }}
                          >
                            <CreditCard className="h-4 w-4" />
                            Pay online
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full"
                            disabled={pending}
                            onClick={() => {
                              setMethod(invoice.method ?? "M-Pesa");
                              setPaying(invoice);
                            }}
                          >
                            <Wallet className="h-4 w-4" />
                            Mark paid
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full"
                          disabled={pending}
                          onClick={() => {
                            setMethod(invoice.method ?? "M-Pesa");
                            setPaying(invoice);
                          }}
                        >
                          <Wallet className="h-4 w-4" />
                          Mark paid
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={paying !== null} onOpenChange={(open) => !open && setPaying(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settle bill</DialogTitle>
            <DialogDescription>
              Mark {paying?.invoiceNumber ?? "this bill"} as paid. Your landlord can verify this
              offline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">Payment method</div>
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
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={pending}
              onClick={() => setPaying(null)}
            >
              Cancel
            </Button>
            <Button className="rounded-full" disabled={pending} onClick={confirmPayment}>
              <CreditCard className="h-4 w-4" />
              Confirm payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReceiptDialog
        open={receipt !== null}
        onOpenChange={(open) => !open && setReceipt(null)}
        invoice={receipt}
      />
    </DashboardShell>
  );
};

export default TenantPaymentsPage;
