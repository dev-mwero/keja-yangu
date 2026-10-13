"use client";

import { ArrowLeftRight, LogOut } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DashboardShell } from "@/components/DashboardShell";
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
import { Textarea } from "@/components/ui/textarea";
import { tenantNav as nav } from "@/config/dashboardNav";
import { useMoveRequestMutations, useMoveRequests } from "@/hooks/use-move-requests";
import { useUnits } from "@/hooks/use-units";
import { formatDate } from "@/lib/format";

const TenantMoveRequestsPage = () => {
  const { moveRequests, loading, refetch } = useMoveRequests();
  const { units } = useUnits();
  const { create, pending } = useMoveRequestMutations();
  const [note, setNote] = useState("");

  const occupiedUnit = units.find((u) => u.status === "occupied");
  const hasPendingMoveOut = moveRequests.some(
    (mr) => mr.type === "move-out" && mr.status === "pending",
  );

  const requestMoveOut = async () => {
    if (!occupiedUnit) {
      toast.error("You have no occupied unit to move out of.");
      return;
    }
    try {
      await create({
        type: "move-out",
        propertyId: occupiedUnit.propertyId,
        unitId: occupiedUnit._id,
        note: note.trim() || undefined,
      });
      toast.success("Move-out request submitted", {
        description: "Your property manager will review it.",
      });
      setNote("");
      refetch();
    } catch (err) {
      toast.error("Could not submit move-out request", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  return (
    <DashboardShell
      roleName="Tenant"
      nav={nav}
      title="Move Requests"
      subtitle="Request a move-out and track your move-in / move-out requests."
    >
      <div className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-lg">Request a move-out</h3>
            <p className="text-sm text-muted-foreground">
              {occupiedUnit
                ? `You are currently in unit ${occupiedUnit.name} (${occupiedUnit.blockName}).`
                : "You have no occupied unit yet."}
            </p>
          </div>
          <Button
            className="rounded-full"
            disabled={pending || !occupiedUnit || hasPendingMoveOut}
            onClick={requestMoveOut}
          >
            <LogOut className="mr-2 h-4 w-4" /> Request move-out
          </Button>
        </div>
        {occupiedUnit && !hasPendingMoveOut && (
          <Textarea
            className="mt-3"
            rows={2}
            placeholder="Optional note (e.g. intended move-out date)…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        )}
        {hasPendingMoveOut && (
          <p className="mt-3 text-xs text-muted-foreground">
            You already have a pending move-out request.
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Decision note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Loading move requests…
                </TableCell>
              </TableRow>
            ) : moveRequests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  <ArrowLeftRight className="mx-auto mb-2 h-6 w-6 opacity-50" />
                  No move requests yet.
                </TableCell>
              </TableRow>
            ) : (
              moveRequests.map((mr) => (
                <TableRow key={mr._id}>
                  <TableCell className="font-medium capitalize">{mr.type}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {mr.requestedDate ? formatDate(mr.requestedDate) : "—"}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {mr.note || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {mr.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {mr.decisionNote || "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </DashboardShell>
  );
};

export default TenantMoveRequestsPage;
