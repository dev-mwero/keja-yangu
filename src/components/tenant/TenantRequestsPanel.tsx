"use client";

import { CheckCircle2, Clock, FileText, LogIn, LogOut, Plus, XCircle } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SearchInput } from "@/components/SearchInput";
import { StatCard } from "@/components/StatCard";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useApplicationMutations, useTenantApplications } from "@/hooks/use-applications";
import { useAuth } from "@/hooks/use-auth";
import { useMoveRequestMutations, useMoveRequests } from "@/hooks/use-move-requests";
import { useMyTenancy } from "@/hooks/use-my-tenancy";
import { useUnits } from "@/hooks/use-units";
import { formatDate } from "@/lib/format";
import { matchesQuery } from "@/lib/search";

type UnifiedStatus = "pending" | "approved" | "rejected" | "cancelled";
type Filter = "all" | UnifiedStatus;

interface UnifiedRow {
  id: string;
  kind: "application" | "move-in" | "move-out";
  detail: string;
  unitLabel: string;
  status: UnifiedStatus;
  submittedAt?: string;
  note: string;
  decisionNote: string;
  decidedAt?: string;
  href?: string;
  withdraw?: { id: string; title: string };
}

const statusIcon: Record<UnifiedStatus, React.ReactNode> = {
  approved: <CheckCircle2 className="h-3.5 w-3.5" />,
  pending: <Clock className="h-3.5 w-3.5" />,
  rejected: <XCircle className="h-3.5 w-3.5" />,
  cancelled: <XCircle className="h-3.5 w-3.5" />,
};

const statusClass: Record<UnifiedStatus, string> = {
  approved: "bg-success/15 text-success",
  pending: "bg-warning/15 text-warning",
  rejected: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

/** One list of everything the tenant has asked their manager for. */
export function TenantRequestsPanel() {
  const { user } = useAuth();
  const { applications, refresh } = useTenantApplications(user?.email);
  const { withdraw, pending: withdrawPending } = useApplicationMutations();
  const { moveRequests, loading, refetch } = useMoveRequests();
  const { create, pending: createPending } = useMoveRequestMutations();
  const { tenancy } = useMyTenancy();

  const propertyId = tenancy?.propertyId ?? "";
  const { units } = useUnits(propertyId ? { propertyId } : undefined);

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
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

  const rows = useMemo<UnifiedRow[]>(() => {
    const applicationRows: UnifiedRow[] = applications.map((app) => ({
      id: `application-${app.id}`,
      kind: "application",
      detail: app.propertyTitle ?? "",
      unitLabel: app.unitName ? `Unit ${app.unitName}` : "",
      status: app.status,
      submittedAt: app.submittedAt,
      note: "",
      decisionNote: "",
      decidedAt: app.decidedAt,
      href: `/properties/${app.propertyId}`,
      withdraw:
        app.status === "pending" ? { id: app.id, title: app.propertyTitle ?? "" } : undefined,
    }));
    const moveRows: UnifiedRow[] = moveRequests.map((mr) => ({
      id: `move-${mr._id}`,
      kind: mr.type,
      detail: mr.unitName ? `${mr.unitName}${mr.blockName ? ` · ${mr.blockName}` : ""}` : "—",
      unitLabel: mr.unitName ? `Unit ${mr.unitName}` : "",
      status: mr.status,
      submittedAt: mr.requestedDate,
      note: mr.note,
      decisionNote: mr.decisionNote,
      decidedAt: mr.decidedAt,
    }));
    return [...applicationRows, ...moveRows].sort((a, b) =>
      (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""),
    );
  }, [applications, moveRequests]);

  const pendingCount = rows.filter((r) => r.status === "pending").length;
  const approvedCount = rows.filter((r) => r.status === "approved").length;
  const visible = (filter === "all" ? rows : rows.filter((r) => r.status === filter)).filter((r) =>
    matchesQuery(query, r.detail, r.unitLabel, r.status, r.note),
  );

  const handleWithdraw = async (id: string, title: string) => {
    try {
      await withdraw(id);
      refresh();
      toast.success("Application withdrawn", {
        description: `${title} removed from your requests.`,
      });
    } catch (err) {
      toast.error("Could not withdraw application", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const submitMoveRequest = async (
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
    const ok = await submitMoveRequest(
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
    const ok = await submitMoveRequest(
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
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total requests" value={rows.length} icon={FileText} />
        <StatCard label="Pending review" value={pendingCount} icon={Clock} />
        <StatCard label="Approved" value={approvedCount} icon={CheckCircle2} />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
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
              disabled={createPending || !propertyId || hasPendingMoveOut}
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
              disabled={
                createPending || !propertyId || hasPendingMoveIn || availableUnits.length === 0
              }
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

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search your requests…"
            className="w-full sm:w-56"
          />
          <Button asChild className="rounded-full">
            <Link href="/properties">
              <Plus className="h-4 w-4" />
              Apply for a home
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Request</TableHead>
              <TableHead>Detail</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Note</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Loading your requests…
                </TableCell>
              </TableRow>
            ) : visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  <FileText className="mx-auto mb-2 h-6 w-6 opacity-50" />
                  {rows.length === 0
                    ? "You have not asked your manager for anything yet."
                    : "Nothing matches this view."}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium capitalize">
                    {row.kind === "application" ? "Application" : row.kind}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.href ? (
                      <Link href={row.href} className="hover:underline">
                        {row.detail}
                      </Link>
                    ) : (
                      row.detail
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.submittedAt ? formatDate(row.submittedAt) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`${statusClass[row.status]} gap-1 capitalize hover:opacity-100`}
                    >
                      {statusIcon[row.status]}
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {row.note || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.withdraw ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full text-muted-foreground"
                        disabled={withdrawPending}
                        onClick={() =>
                          row.withdraw && handleWithdraw(row.withdraw.id, row.withdraw.title)
                        }
                      >
                        Withdraw
                      </Button>
                    ) : row.status !== "pending" && row.decidedAt ? (
                      <span className="text-xs text-muted-foreground">
                        Decided {formatDate(row.decidedAt)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {row.kind === "application" ? "" : row.decisionNote || "—"}
                      </span>
                    )}
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
