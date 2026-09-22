"use client";

import { Banknote, CheckCircle2, Clock, Plus, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/DashboardShell";
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
import { ownerNav as nav } from "@/config/dashboardNav";
import {
  type Invoice,
  type InvoiceStatus,
  invoicesStore,
  type PaymentMethod,
} from "@/data/dashboard";
import { useLocalStore } from "@/hooks/use-local-store";
import { formatDate, formatKES } from "@/lib/format";

const statusClass: Record<InvoiceStatus, string> = {
  paid: "bg-success/15 text-success",
  pending: "bg-warning/15 text-warning",
  overdue: "bg-destructive/15 text-destructive",
};

const methods: PaymentMethod[] = ["M-Pesa", "Card", "Bank"];

const OwnerAccountingPage = () => {
  const { items, updateItem } = useLocalStore<Invoice>(invoicesStore);
  const [recording, setRecording] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("M-Pesa");

  const billed = items.reduce((sum, i) => sum + i.amount, 0);
  const collected = items.filter((i) => i.status === "paid").reduce((sum, i) => sum + i.amount, 0);
  const outstanding = items
    .filter((i) => i.status !== "paid")
    .reduce((sum, i) => sum + i.amount, 0);
  const collectionRate = billed > 0 ? Math.round((collected / billed) * 100) : 0;

  const byPeriod = useMemo(() => {
    const map = new Map<string, { billed: number; collected: number }>();
    for (const invoice of items) {
      const entry = map.get(invoice.period) ?? { billed: 0, collected: 0 };
      entry.billed += invoice.amount;
      if (invoice.status === "paid") entry.collected += invoice.amount;
      map.set(invoice.period, entry);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [items]);

  const latest = byPeriod[0];

  const recordPayment = () => {
    const invoice = items.find((i) => i.id === recording);
    if (!invoice) return;
    updateItem(invoice.id, { status: "paid", paidAt: new Date().toISOString(), method });
    toast.success("Payment recorded", {
      description: `${invoice.tenant} settled ${invoice.number} via ${method}.`,
    });
    setRecording(null);
  };

  return (
    <DashboardShell
      roleName="Owner"
      nav={nav}
      title="Accounting"
      subtitle="Revenue across your entire portfolio."
    >
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Billed" value={formatKES(billed)} icon={Banknote} />
        <StatCard
          label="Collected"
          value={formatKES(collected)}
          hint={`${collectionRate}% collection rate`}
          icon={CheckCircle2}
        />
        <StatCard label="Outstanding" value={formatKES(outstanding)} icon={Clock} />
        <StatCard
          label="This month"
          value={latest ? formatKES(latest[1].collected) : "—"}
          hint={latest?.[0]}
          icon={TrendingUp}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
          <h3 className="font-display text-lg font-semibold">Invoices</h3>
          <div className="mt-4">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
            ) : (
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
                    {items.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-medium">{invoice.number}</TableCell>
                        <TableCell>
                          <p className="font-medium">{invoice.tenant}</p>
                          <p className="text-xs text-muted-foreground">{invoice.property}</p>
                        </TableCell>
                        <TableCell className="font-medium">{formatKES(invoice.amount)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(invoice.dueDate)}
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
                            <span className="text-xs text-muted-foreground">
                              {invoice.method ?? "Paid"}
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              className="rounded-full"
                              onClick={() => setRecording(invoice.id)}
                            >
                              <Plus className="h-4 w-4" />
                              Record
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
                  <p className="font-medium">{period}</p>
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

      <Dialog open={recording !== null} onOpenChange={(open) => !open && setRecording(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>
              {items.find((i) => i.id === recording)
                ? `Mark ${items.find((i) => i.id === recording)?.number} as paid.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">Payment method</div>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {methods.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setRecording(null)}>
              Cancel
            </Button>
            <Button className="rounded-full" onClick={recordPayment}>
              Record payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
};

export default OwnerAccountingPage;
