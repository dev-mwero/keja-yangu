"use client";

import { CheckCircle2, CreditCard, Download, Loader2, Smartphone, Wallet } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/DashboardShell";
import { ReceiptDialog } from "@/components/invoices/ReceiptDialog";
import { SearchInput } from "@/components/SearchInput";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { manualMethodRequiresReference } from "@/lib/payments/methods";
import { COUNTRIES, DEFAULT_COUNTRY, isValidE164, toE164 } from "@/lib/phone";
import { matchesQuery } from "@/lib/search";
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
  const { markOwnPaid, initiatePay, initiateMpesa, checkPaymentReference, pending } =
    useMyInvoiceMutations();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [query, setQuery] = useState("");
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [method, setMethod] = useState<InvoiceMethod>("M-Pesa");
  const [reference, setReference] = useState("");
  const [receipt, setReceipt] = useState<Invoice | null>(null);

  // M-Pesa STK flow: collect a phone number, send the push, then poll the
  // status route until the tenant approves (or the attempt fails / lapses).
  const [mpesaInvoice, setMpesaInvoice] = useState<Invoice | null>(null);
  const [mpesaDial, setMpesaDial] = useState(DEFAULT_COUNTRY.dial);
  const [mpesaNational, setMpesaNational] = useState("");
  const [mpesaPhase, setMpesaPhase] = useState<"form" | "waiting">("form");
  const mpesaAbort = useRef(false);

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
            description: `Payment of ${formatKES(result.payment.amountMinor / 100)} received.`,
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
  const paidTotal = history.reduce((sum, i) => sum + Math.min(i.amountDue, i.amountPaid ?? 0), 0);
  const nextDue = upcoming.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  const tabRows = tab === "history" ? history : upcoming;
  const rows = tabRows.filter((invoice) =>
    matchesQuery(query, invoice.period, invoice.invoiceNumber, invoice.status),
  );

  const confirmPayment = async () => {
    if (!paying) return;
    try {
      await markOwnPaid(paying._id, {
        method,
        reference: reference.trim() || undefined,
      });
      toast.success("Payment recorded", {
        description: `Payment recorded for ${paying.invoiceNumber} via ${method}.`,
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

  const closeMpesa = () => {
    mpesaAbort.current = true;
    setMpesaInvoice(null);
    setMpesaPhase("form");
    setMpesaNational("");
    setMpesaDial(DEFAULT_COUNTRY.dial);
  };

  // Polls the status route (which queries Daraja) for up to ~2 minutes. Stops
  // early on a settled invoice or a definitive failure; a transient network
  // error just retries on the next tick.
  const pollMpesa = async (reference: string) => {
    mpesaAbort.current = false;
    for (let attempt = 0; attempt < 24 && !mpesaAbort.current; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      if (mpesaAbort.current) return;
      try {
        const result = await checkPaymentReference(reference);
        if (mpesaAbort.current) return;
        if (result.invoice?.status === "paid") {
          toast.success("Payment confirmed", {
            description: `Payment of ${formatKES(result.payment.amountMinor / 100)} received.`,
          });
          refetch();
          closeMpesa();
          return;
        }
        if (result.payment.status === "failed") {
          toast.error("M-Pesa payment failed", {
            description: "The request was declined or cancelled. You can try again.",
          });
          closeMpesa();
          return;
        }
      } catch {
        // Transient — keep polling while the prompt is still live.
      }
    }
    if (!mpesaAbort.current) {
      toast.info("Still waiting on M-Pesa", {
        description: "We have not received the confirmation yet. Check this bill again shortly.",
      });
      closeMpesa();
    }
  };

  const handlePayMpesa = async () => {
    if (!mpesaInvoice) return;
    const phone = toE164(mpesaDial, mpesaNational);
    if (!isValidE164(phone)) {
      toast.error("Enter a valid phone number", {
        description: "Use the number registered to your M-Pesa account.",
      });
      return;
    }
    try {
      const result = await initiateMpesa(mpesaInvoice._id, phone);
      setMpesaPhase("waiting");
      void pollMpesa(result.reference);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast.error("Could not start M-Pesa payment", { description: message });
    }
  };

  useEffect(() => {
    return () => {
      mpesaAbort.current = true;
    };
  }, []);

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
          value={
            nextDue ? formatKES(Math.max(0, nextDue.amountDue - (nextDue.amountPaid ?? 0))) : "—"
          }
          hint={
            nextDue ? `${formatPeriod(nextDue.period)} · ${nextDue.invoiceNumber}` : "Nothing due"
          }
          icon={Wallet}
        />
        <StatCard label="Paid to date" value={formatKES(paidTotal)} icon={CheckCircle2} />
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </Tabs>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search bills…"
          className="w-full sm:w-56"
        />
      </div>

      <div className="mt-6">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
            <Wallet className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 font-display text-xl">Nothing here</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {tabRows.length > 0
                ? "No bills match your search."
                : tab === "history"
                  ? "You have no past payments yet."
                  : "All bills are settled."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill</TableHead>
                  <TableHead>{tab === "history" ? "Paid" : "Balance due"}</TableHead>
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
                    <TableCell className="font-medium">
                      <div>
                        {tab === "history"
                          ? formatKES(Math.min(invoice.amountDue, invoice.amountPaid ?? 0))
                          : formatKES(Math.max(0, invoice.amountDue - (invoice.amountPaid ?? 0)))}
                      </div>
                      {(invoice.serviceChargeAmount ?? 0) > 0 && (
                        <div className="mt-1 space-y-0.5 text-[11px] font-normal text-muted-foreground">
                          <div>Rent {formatKES(invoice.rentAmount ?? Math.max(0, invoice.amountDue - (invoice.serviceChargeAmount ?? 0)))}</div>
                          <div>Service fee {formatKES(invoice.serviceChargeAmount ?? 0)}</div>
                        </div>
                      )}
                    </TableCell>
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
                        <div className="flex flex-wrap justify-end gap-2">
                          {(invoice.online?.paystack ?? true) && (
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
                          )}
                          {invoice.online?.mpesa && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-full"
                              disabled={pending}
                              onClick={() => {
                                setMpesaDial(DEFAULT_COUNTRY.dial);
                                setMpesaNational("");
                                setMpesaPhase("form");
                                setMpesaInvoice(invoice);
                              }}
                            >
                              <Smartphone className="h-4 w-4" />
                              Pay with M-Pesa
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full"
                            disabled={pending}
                            onClick={() => {
                              setMethod(invoice.method ?? "M-Pesa");
                              setReference("");
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
                            setReference("");
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
          {manualMethodRequiresReference(method) && (
            <div className="space-y-2">
              <Label htmlFor="tenant-payment-reference">Transaction reference</Label>
              <Input
                id="tenant-payment-reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={
                  method === "M-Pesa" ? "e.g. QK12ABC3XY" : "Bank slip or transfer reference"
                }
              />
              <p className="text-xs text-muted-foreground">
                Required for {method} so your landlord can reconcile the payment.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={pending}
              onClick={() => setPaying(null)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-full"
              disabled={
                pending || (manualMethodRequiresReference(method) && reference.trim() === "")
              }
              onClick={confirmPayment}
            >
              <CreditCard className="h-4 w-4" />
              Confirm payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={mpesaInvoice !== null}
        onOpenChange={(open) => {
          if (!open) closeMpesa();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pay with M-Pesa</DialogTitle>
            <DialogDescription>
              {mpesaPhase === "waiting"
                ? "Approve the request on your phone to complete the payment."
                : `We will send an STK prompt to your phone for ${mpesaInvoice?.invoiceNumber ?? "this bill"}.`}
            </DialogDescription>
          </DialogHeader>

          {mpesaPhase === "waiting" ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="font-medium">Check your phone</p>
              <p className="text-sm text-muted-foreground">
                Enter your M-Pesa PIN on the prompt to pay{" "}
                {formatKES(
                  Math.max(0, (mpesaInvoice?.amountDue ?? 0) - (mpesaInvoice?.amountPaid ?? 0)),
                )}
                . This page updates automatically once it is confirmed.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="mpesa-phone">M-Pesa phone number</Label>
              <div className="flex gap-2">
                <Select value={mpesaDial} onValueChange={setMpesaDial}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((country) => (
                      <SelectItem key={country.code} value={country.dial}>
                        {country.name} ({country.dial})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  id="mpesa-phone"
                  inputMode="tel"
                  value={mpesaNational}
                  onChange={(e) => setMpesaNational(e.target.value)}
                  placeholder="712 345 678"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Use the number registered to your M-Pesa account.
              </p>
            </div>
          )}

          <DialogFooter>
            {mpesaPhase === "waiting" ? (
              <Button variant="outline" className="rounded-full" onClick={closeMpesa}>
                Close
              </Button>
            ) : (
              <>
                <Button variant="outline" className="rounded-full" onClick={closeMpesa}>
                  Cancel
                </Button>
                <Button
                  className="rounded-full"
                  disabled={pending || toE164(mpesaDial, mpesaNational) === ""}
                  onClick={() => {
                    void handlePayMpesa();
                  }}
                >
                  <Smartphone className="h-4 w-4" />
                  Send request
                </Button>
              </>
            )}
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
