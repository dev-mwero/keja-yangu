"use client";

import { CheckCircle2, CircleDollarSign, Clock, Plus } from "lucide-react";
import { useState } from "react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { caretakerNav as nav } from "@/config/dashboardNav";
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

const CaretakerAccountingPage = () => {
  const { items, updateItem } = useLocalStore<Invoice>(invoicesStore);
  const [tab, setTab] = useState<InvoiceStatus | "all">("all");
  const [recording, setRecording] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("M-Pesa");

  const outstanding = items.filter((i) => i.status !== "paid");
  const collected = items.filter((i) => i.status === "paid");
  const overdue = items.filter((i) => i.status === "overdue");
  const outstandingTotal = outstanding.reduce((sum, i) => sum + i.amount, 0);
  const collectedTotal = collected.reduce((sum, i) => sum + i.amount, 0);

  const visible = tab === "all" ? items : items.filter((i) => i.status === tab);

  const recordPayment = () => {
    const invoice = items.find((i) => i.id === recording);
    if (!invoice) return;
    updateItem(invoice.id, {
      status: "paid",
      paidAt: new Date().toISOString(),
      method,
    });
    toast.success("Payment recorded", {
      description: `${invoice.tenant} settled ${invoice.number} via ${method}.`,
    });
    setRecording(null);
  };

  return (
    <DashboardShell
      roleName="Caretaker"
      nav={nav}
      title="Accounting"
      subtitle="Track rent collection for the tenants you manage."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Outstanding"
          value={formatKES(outstandingTotal)}
          hint={`${outstanding.length} open`}
          icon={Clock}
        />
        <StatCard
          label="Collected"
          value={formatKES(collectedTotal)}
          hint={`${collected.length} payments`}
          icon={CheckCircle2}
        />
        <StatCard
          label="Overdue"
          value={overdue.length}
          hint={formatKES(overdue.reduce((s, i) => s + i.amount, 0))}
          icon={CircleDollarSign}
        />
      </div>

      <div className="mt-8">
        <Tabs value={tab} onValueChange={(v) => setTab(v as InvoiceStatus | "all")}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="overdue">Overdue</TabsTrigger>
            <TabsTrigger value="paid">Paid</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="mt-6">
        {visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
            <CircleDollarSign className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 font-display text-xl">No invoices here</h3>
            <p className="mt-1 text-sm text-muted-foreground">Nothing matches this view.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.number}</TableCell>
                    <TableCell>
                      <p className="font-medium">{invoice.tenant}</p>
                      <p className="text-xs text-muted-foreground">{invoice.tenantEmail}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{invoice.property}</TableCell>
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
                          Record payment
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

export default CaretakerAccountingPage;
