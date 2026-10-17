"use client";

import { ArrowLeftRight, LogIn, LogOut } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { useMoveRequestMutations, useMoveRequests } from "@/hooks/use-move-requests";
import { useMyTenancy } from "@/hooks/use-my-tenancy";
import { useUnits } from "@/hooks/use-units";
import { formatDate } from "@/lib/format";

/** Tenant move-request body — rendered inside the Requests tabs. */
export function TenantMoveRequestsPanel() {
  const { moveRequests, loading, refetch } = useMoveRequests();
  const { tenancy } = useMyTenancy();
  const { create, pending } = useMoveRequestMutations();

  const propertyId = tenancy?.propertyId ?? "";
  const { units } = useUnits(propertyId ? { propertyId } : undefined);

  const [moveOutNote, setMoveOutNote] = useState("");
  const [moveInUnitId, setMoveInUnitId] = useState("");
  const [moveInNote, setMoveInNote] = useState("");

  // A unit is "mine" if it is unlinked (legacy) or bound to my userId.
  const occupiedUnit = units.find(
    (u) => u.status === "occupied" && (!u.tenantId || u.tenantId === tenancy?.userId),
  );
  const availableUnits = units.filter((u) => u.status === "available");

  const hasPendingMoveOut = moveRequests.some(
    (mr) => mr.type === "move-out" && mr.status === "pending",
  );
  const hasPendingMoveIn = moveRequests.some(
    (mr) => mr.type === "move-in" && mr.status === "pending",
  );

  const submit = async (
    payload: Parameters<typeof create>[0],
    successMsg: string,
    errMsg: string,
  ) => {
    try {
      await create(payload);
      toast.success(successMsg, { description: "Your property manager will review it." });
      refetch();
      return true;
    } catch (err) {
      toast.error(errMsg, {
        description: err instanceof Error ? err.message : undefined,
      });
      return false;
    }
  };

  const requestMoveOut = async () => {
    if (!propertyId) {
      toast.error("You have no tenancy on record.");
      return;
    }
    const ok = await submit(
      {
        type: "move-out",
        propertyId,
        unitId: occupiedUnit?._id,
        note: moveOutNote.trim() || undefined,
      },
      "Move-out request submitted",
      "Could not submit move-out request",
    );
    if (ok) setMoveOutNote("");
  };

  const requestMoveIn = async () => {
    if (!propertyId) {
      toast.error("You have no tenancy on record.");
      return;
    }
    if (!moveInUnitId) {
      toast.error("Choose a unit to move into.");
      return;
    }
    const ok = await submit(
      {
        type: "move-in",
        propertyId,
        unitId: moveInUnitId,
        note: moveInNote.trim() || undefined,
      },
      "Move-in request submitted",
      "Could not submit move-in request",
    );
    if (ok) {
      setMoveInUnitId("");
      setMoveInNote("");
    }
  };

  return (
    <>
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-display text-lg">Request a move-out</h3>
              <p className="text-sm text-muted-foreground">
                {occupiedUnit
                  ? `You are currently in unit ${occupiedUnit.name} (${occupiedUnit.blockName}).`
                  : propertyId
                    ? "We could not auto-detect your unit; submit anyway and your manager will confirm."
                    : "You have no tenancy on record."}
              </p>
            </div>
            <Button
              className="rounded-full"
              disabled={pending || !propertyId || hasPendingMoveOut}
              onClick={requestMoveOut}
            >
              <LogOut className="mr-2 h-4 w-4" /> Request move-out
            </Button>
          </div>
          {propertyId && !hasPendingMoveOut && (
            <Textarea
              className="mt-3"
              rows={2}
              placeholder="Optional note (e.g. intended move-out date)…"
              value={moveOutNote}
              onChange={(e) => setMoveOutNote(e.target.value)}
            />
          )}
          {hasPendingMoveOut && (
            <p className="mt-3 text-xs text-muted-foreground">
              You already have a pending move-out request.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-display text-lg">Request a move-in</h3>
              <p className="text-sm text-muted-foreground">
                {availableUnits.length > 0
                  ? `${availableUnits.length} unit(s) available at your property.`
                  : propertyId
                    ? "No vacant units available at your property right now."
                    : "You have no tenancy on record."}
              </p>
            </div>
            <Button
              className="rounded-full"
              disabled={pending || !propertyId || hasPendingMoveIn || availableUnits.length === 0}
              onClick={requestMoveIn}
            >
              <LogIn className="mr-2 h-4 w-4" /> Request move-in
            </Button>
          </div>
          {propertyId && !hasPendingMoveIn && availableUnits.length > 0 && (
            <div className="mt-3 space-y-2">
              <Select value={moveInUnitId} onValueChange={setMoveInUnitId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a unit" />
                </SelectTrigger>
                <SelectContent>
                  {availableUnits.map((u) => (
                    <SelectItem key={u._id} value={u._id}>
                      {u.name} ({u.blockName})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                rows={2}
                placeholder="Optional note…"
                value={moveInNote}
                onChange={(e) => setMoveInNote(e.target.value)}
              />
            </div>
          )}
          {hasPendingMoveIn && (
            <p className="mt-3 text-xs text-muted-foreground">
              You already have a pending move-in request.
            </p>
          )}
        </div>
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
    </>
  );
}
