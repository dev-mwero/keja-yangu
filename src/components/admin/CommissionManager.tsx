"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatKES } from "@/lib/format";

interface Accrual {
  _id: string;
  brokerUserId: string;
  invoiceId: string;
  kind: string;
  grossMinor: number;
  taxMinor: number;
  netMinor: number;
  status: string;
  eligibilityAt?: string;
}

interface Payout {
  _id: string;
  batchCode: string;
  brokerUserId: string;
  netMinor: number;
  status: string;
  createdAt?: string;
}

function money(minor: number) {
  return formatKES((minor || 0) / 100);
}

export function CommissionManager() {
  const [accruals, setAccruals] = useState<Accrual[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [accrualRes, payoutRes] = await Promise.all([
        fetch("/api/v1/commissions?limit=100"),
        fetch("/api/v1/admin/commission-payouts?limit=100"),
      ]);
      if (accrualRes.ok) {
        const data = await accrualRes.json();
        setAccruals(data.data || []);
      }
      if (payoutRes.ok) {
        const data = await payoutRes.json();
        setPayouts(data.data || []);
      }
    } catch {
      toast.error("Failed to load commissions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const approvedByBroker = useMemo(() => {
    const groups = new Map<string, Accrual[]>();
    for (const accrual of accruals) {
      if (accrual.status !== "approved") continue;
      const list = groups.get(accrual.brokerUserId) ?? [];
      list.push(accrual);
      groups.set(accrual.brokerUserId, list);
    }
    return [...groups.entries()];
  }, [accruals]);

  const runAction = async (key: string, url: string, body?: unknown, success?: string) => {
    try {
      setBusyId(key);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Action failed");
      toast.success(success ?? "Done");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const approve = (id: string) =>
    runAction(id, `/api/v1/commissions/${id}/approve`, {}, "Commission approved");

  const clawback = (id: string) => {
    const reason = window.prompt("Reason for clawback?");
    if (!reason) return;
    void runAction(id, `/api/v1/commissions/${id}/clawback`, { reason }, "Commission clawed back");
  };

  const createPayout = (brokerUserId: string, ids: string[]) =>
    runAction(
      brokerUserId,
      "/api/v1/admin/commission-payouts",
      { brokerUserId, accrualIds: ids },
      "Payout batch created",
    );

  const pay = (id: string) =>
    runAction(id, `/api/v1/admin/commission-payouts/${id}/pay`, {}, "Payout executed");

  const fail = (id: string) => {
    const reason = window.prompt("Reason for payout failure?");
    if (!reason) return;
    void runAction(
      id,
      `/api/v1/admin/commission-payouts/${id}/fail`,
      { reason },
      "Payout marked failed",
    );
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <h3 className="font-semibold">Commission Accruals</h3>
          <p className="text-xs text-muted-foreground">
            Shadow accruals from collected rent. Approve eligible rows before batching payouts.
          </p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : accruals.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No commission accruals yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Broker</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Gross</TableHead>
                  <TableHead>Tax</TableHead>
                  <TableHead>Net</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accruals.map((accrual) => (
                  <TableRow key={accrual._id}>
                    <TableCell className="font-mono text-xs">{accrual.brokerUserId}</TableCell>
                    <TableCell className="font-mono text-xs">{accrual.invoiceId}</TableCell>
                    <TableCell className="capitalize">
                      {String(accrual.kind).replace(/_/g, " ")}
                    </TableCell>
                    <TableCell>{money(accrual.grossMinor)}</TableCell>
                    <TableCell>{money(accrual.taxMinor)}</TableCell>
                    <TableCell className="font-medium">{money(accrual.netMinor)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          accrual.status === "reversed" || accrual.status === "disputed"
                            ? "destructive"
                            : accrual.status === "paid"
                              ? "default"
                              : "outline"
                        }
                        className="capitalize"
                      >
                        {accrual.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {accrual.status === "eligible" && (
                        <Button
                          size="sm"
                          disabled={busyId === accrual._id}
                          onClick={() => approve(accrual._id)}
                        >
                          Approve
                        </Button>
                      )}
                      {accrual.status !== "reversed" && accrual.status !== "paid" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-2"
                          disabled={busyId === accrual._id}
                          onClick={() => clawback(accrual._id)}
                        >
                          Clawback
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

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <h3 className="font-semibold">Ready to Batch</h3>
          <p className="text-xs text-muted-foreground">
            Approved accruals grouped by broker. Payout execution stays blocked until
            COMMISSION_PAYOUTS_ENABLED=true.
          </p>
        </div>
        {approvedByBroker.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No approved accruals waiting for payout.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {approvedByBroker.map(([brokerUserId, rows]) => {
              const total = rows.reduce((sum, row) => sum + row.netMinor, 0);
              return (
                <div
                  key={brokerUserId}
                  className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-mono text-xs">{brokerUserId}</p>
                    <p className="text-sm text-muted-foreground">
                      {rows.length} accrual{rows.length === 1 ? "" : "s"} • {money(total)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={busyId === brokerUserId}
                    onClick={() =>
                      createPayout(
                        brokerUserId,
                        rows.map((row) => row._id),
                      )
                    }
                  >
                    Create Payout Batch
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <h3 className="font-semibold">Payout Batches</h3>
          <p className="text-xs text-muted-foreground">
            Execute only after finance sign-off. Failures restore accruals for retry.
          </p>
        </div>
        {payouts.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No payouts yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Broker</TableHead>
                  <TableHead>Net</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((payout) => (
                  <TableRow key={payout._id}>
                    <TableCell className="font-mono text-xs">{payout.batchCode}</TableCell>
                    <TableCell className="font-mono text-xs">{payout.brokerUserId}</TableCell>
                    <TableCell>{money(payout.netMinor)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          payout.status === "failed"
                            ? "destructive"
                            : payout.status === "paid"
                              ? "default"
                              : "outline"
                        }
                        className="capitalize"
                      >
                        {payout.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {payout.status === "approved" && (
                        <>
                          <Button
                            size="sm"
                            disabled={busyId === payout._id}
                            onClick={() => pay(payout._id)}
                          >
                            Pay
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="ml-2"
                            disabled={busyId === payout._id}
                            onClick={() => fail(payout._id)}
                          >
                            Fail
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
