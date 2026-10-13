"use client";

import { ArrowLeftRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DashboardShell } from "@/components/DashboardShell";
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
import type { DashNavItem } from "@/config/dashboardNav";
import {
  type MoveRequestStatus,
  useMoveRequestMutations,
  useMoveRequests,
} from "@/hooks/use-move-requests";
import { MOVE_REQUEST_STATUSES } from "@/lib/domain-enums";
import { formatDate } from "@/lib/format";

interface Props {
  nav: DashNavItem[];
  roleName: string;
  canDecide?: boolean;
}

export function MoveRequestsView({ nav, roleName, canDecide = true }: Props) {
  const [statusFilter, setStatusFilter] = useState<"all" | MoveRequestStatus>("pending");
  const { moveRequests, loading, refetch } = useMoveRequests(
    statusFilter === "all" ? undefined : { status: statusFilter },
  );
  const { decide, pending } = useMoveRequestMutations();

  const act = async (id: string, status: MoveRequestStatus) => {
    try {
      await decide(id, status);
      toast.success(`Move request ${status}`);
      refetch();
    } catch (err) {
      toast.error("Could not update move request", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  return (
    <DashboardShell
      roleName={roleName}
      nav={nav}
      title="Move Requests"
      subtitle="Approve or reject tenant move-in and move-out requests."
    >
      <div className="mb-4">
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as "all" | MoveRequestStatus)}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {MOVE_REQUEST_STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Requested by</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>Status</TableHead>
              {canDecide && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Loading move requests…
                </TableCell>
              </TableRow>
            ) : moveRequests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  <ArrowLeftRight className="mx-auto mb-2 h-6 w-6 opacity-50" />
                  No move requests.
                </TableCell>
              </TableRow>
            ) : (
              moveRequests.map((mr) => (
                <TableRow key={mr._id}>
                  <TableCell className="font-medium capitalize">{mr.type}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {mr.requestedByRole}
                  </TableCell>
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
                  {canDecide && (
                    <TableCell className="text-right">
                      {mr.status === "pending" ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            disabled={pending}
                            onClick={() => act(mr._id, "approved")}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => act(mr._id, "rejected")}
                          >
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Decided</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </DashboardShell>
  );
}
