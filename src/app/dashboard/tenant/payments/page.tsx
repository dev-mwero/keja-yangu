"use client";

import { CheckCircle2, CreditCard, Download, Repeat, Wallet } from "lucide-react";
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
import { tenantNav } from "@/config/dashboardNav";
import { type Payment, type PaymentMethod, paymentsStore } from "@/data/dashboard";
import { useLocalStore } from "@/hooks/use-local-store";
import { formatKES } from "@/lib/format";

const statusClass: Record<Payment["status"], string> = {
  paid: "bg-success/15 text-success",
  due: "bg-warning/15 text-warning",
  overdue: "bg-destructive/15 text-destructive",
};

const methods: PaymentMethod[] = ["M-Pesa", "Card", "Bank"];

type Tab = "upcoming" | "history" | "autopay";

const TenantPaymentsPage = () => {
  const { items, updateItem } = useLocalStore<Payment>(paymentsStore);
  const [tab, setTab] = useState<Tab>("upcoming");
  const [paying, setPaying] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("M-Pesa");

  const due = items.filter((p) => p.status !== "paid");
  const history = items.filter((p) => p.status === "paid");
  const autoPay = items.filter((p) => p.autoPay);
  const paidTotal = history.reduce((sum, p) => sum + p.amount, 0);
  const nextDue = items
    .filter((p) => p.status !== "paid" && p.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  const confirmPayment = () => {
    const payment = items.find((p) => p.id === paying);
    if (!payment) return;
    updateItem(payment.id, {
      status: "paid",
      paidDate: new Date().toISOString(),
      method,
    });
    toast.success("Payment recorded", {
      description: `${payment.label} settled via ${method}.`,
    });
    setPaying(null);
  };

  const toggleAutopay = (id: string, value: boolean) => {
    updateItem(id, { autoPay: value });
    toast.info(value ? "Auto-pay enabled" : "Auto-pay paused", {
      description: value
        ? "Upcoming bills will be settled automatically."
        : "You'll be reminded when bills are due.",
    });
  };

  const rows = tab === "autopay" ? autoPay : tab === "history" ? history : due;

  return (
    <DashboardShell
      roleName="Tenant"
      nav={tenantNav}
      title="Payments"
      subtitle="Track rent and bills, and manage auto-pay."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Next payment"
          value={nextDue ? formatKES(nextDue.amount) : "—"}
          hint={nextDue ? `${nextDue.label} · ${nextDue.property}` : "Nothing due"}
          icon={Wallet}
        />
        <StatCard label="Paid to date" value={formatKES(paidTotal)} icon={CheckCircle2} />
        <StatCard
          label="Auto-pay"
          value={autoPay.length}
          hint={autoPay.length > 0 ? "Bills settle automatically" : "Off for all bills"}
          icon={Repeat}
        />
      </div>

      <div className="mt-8">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="autopay">Auto-pay</TabsTrigger>
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
                {rows.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      <p className="font-medium">{payment.label}</p>
                      <p className="text-xs text-muted-foreground">{payment.property}</p>
                    </TableCell>
                    <TableCell className="font-medium">{formatKES(payment.amount)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(payment.dueDate).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`${statusClass[payment.status]} capitalize hover:opacity-100`}
                      >
                        {payment.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {tab === "autopay" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full"
                          onClick={() => toggleAutopay(payment.id, !payment.autoPay)}
                        >
                          {payment.autoPay ? "Pause auto-pay" : "Enable auto-pay"}
                        </Button>
                      ) : payment.status === "paid" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-full text-muted-foreground"
                        >
                          <Download className="h-4 w-4" />
                          Receipt
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="rounded-full"
                          onClick={() => setPaying(payment.id)}
                        >
                          Pay now
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
              Choose how you want to pay for{" "}
              {items.find((p) => p.id === paying)?.label ?? "this bill"}.
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
            <Button variant="outline" className="rounded-full" onClick={() => setPaying(null)}>
              Cancel
            </Button>
            <Button className="rounded-full" onClick={confirmPayment}>
              <CreditCard className="h-4 w-4" />
              Confirm payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
};

export default TenantPaymentsPage;
