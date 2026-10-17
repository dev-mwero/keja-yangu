"use client";

import { FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DashboardShell } from "@/components/DashboardShell";
import { SearchInput } from "@/components/SearchInput";
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
  type ApplicationStatus,
  useApplicationMutations,
  useApplications,
} from "@/hooks/use-applications";
import { APPLICATION_STATUSES } from "@/lib/domain-enums";
import { formatDate } from "@/lib/format";
import { matchesQuery } from "@/lib/search";

interface Props {
  nav: DashNavItem[];
  roleName: string;
  canDecide?: boolean;
}

const statusClass: Record<ApplicationStatus, string> = {
  approved: "bg-success/15 text-success",
  pending: "bg-warning/15 text-warning",
  rejected: "bg-destructive/15 text-destructive",
};

export function ApplicationsView({ nav, roleName, canDecide = true }: Props) {
  const [statusFilter, setStatusFilter] = useState<"all" | ApplicationStatus>("pending");
  const [query, setQuery] = useState("");
  const { applications, loading, refetch } = useApplications(
    statusFilter === "all" ? undefined : { status: statusFilter },
  );
  const { decide, pending } = useApplicationMutations();

  const visible = applications.filter((a) =>
    matchesQuery(
      query,
      a.propertyTitle,
      a.unitName,
      a.applicantName,
      a.applicantEmail,
      a.message,
      a.status,
    ),
  );

  const act = async (id: string, status: ApplicationStatus) => {
    try {
      await decide(id, status);
      toast.success(`Application ${status}`);
      refetch();
    } catch (err) {
      toast.error("Could not update application", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  return (
    <DashboardShell
      roleName={roleName}
      nav={nav}
      title="Applications"
      subtitle="Review tenancy applications and approve or reject them."
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as "all" | ApplicationStatus)}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {APPLICATION_STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search applications…"
          className="w-full sm:w-64"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Property</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Applicant</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Status</TableHead>
              {canDecide && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  Loading applications…
                </TableCell>
              </TableRow>
            ) : visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  <FileText className="mx-auto mb-2 h-6 w-6 opacity-50" />
                  No applications.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.propertyTitle || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{a.unitName || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{a.applicantName}</TableCell>
                  <TableCell className="text-muted-foreground">{a.applicantEmail}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {a.message || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {a.submittedAt ? formatDate(a.submittedAt) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`${statusClass[a.status]} gap-1 capitalize hover:opacity-100`}
                    >
                      {a.status}
                    </Badge>
                  </TableCell>
                  {canDecide && (
                    <TableCell className="text-right">
                      {a.status === "pending" ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            disabled={pending}
                            title={
                              a.unitId
                                ? "Approve the application and move the applicant into the requested unit."
                                : "Choose a unit before approving so the applicant is moved in."
                            }
                            onClick={() => act(a.id, "approved")}
                          >
                            {a.unitId ? "Approve & move in" : "Admit"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => act(a.id, "rejected")}
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
