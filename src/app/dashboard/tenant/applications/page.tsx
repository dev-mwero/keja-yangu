"use client";

import { CheckCircle2, Clock, FileText, Plus, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/DashboardShell";
import { StatCard } from "@/components/StatCard";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { tenantNav } from "@/config/dashboardNav";
import { useTenantApplications } from "@/hooks/use-applications";
import { useAuth } from "@/hooks/use-auth";
import { type ApplicationStatus, cancelApplication } from "@/lib/applications";
import { formatDate } from "@/lib/format";

const statusIcon: Record<ApplicationStatus, React.ReactNode> = {
  approved: <CheckCircle2 className="h-3.5 w-3.5" />,
  pending: <Clock className="h-3.5 w-3.5" />,
  rejected: <XCircle className="h-3.5 w-3.5" />,
};

const statusClass: Record<ApplicationStatus, string> = {
  approved: "bg-success/15 text-success",
  pending: "bg-warning/15 text-warning",
  rejected: "bg-destructive/15 text-destructive",
};

type Filter = "all" | ApplicationStatus;

const TenantApplicationsPage = () => {
  const { user } = useAuth();
  const { applications, refresh } = useTenantApplications(user?.email);
  const [filter, setFilter] = useState<Filter>("all");

  const pendingCount = applications.filter((a) => a.status === "pending").length;
  const approvedCount = applications.filter((a) => a.status === "approved").length;
  const visible = filter === "all" ? applications : applications.filter((a) => a.status === filter);

  const handleCancel = (id: string, title: string) => {
    cancelApplication(id, user?.email ?? "");
    refresh();
    toast.success("Application withdrawn", { description: `${title} removed from your requests.` });
  };

  return (
    <DashboardShell
      roleName="Tenant"
      nav={tenantNav}
      title="Applications"
      subtitle="Review the homes you've applied for and track decisions."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total applications" value={applications.length} icon={FileText} />
        <StatCard label="Pending review" value={pendingCount} icon={Clock} />
        <StatCard label="Approved" value={approvedCount} icon={CheckCircle2} />
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button asChild className="rounded-full">
          <Link href="/properties">
            <Plus className="h-4 w-4" />
            Apply for a home
          </Link>
        </Button>
      </div>

      <div className="mt-6">
        {visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 font-display text-xl">
              {applications.length === 0 ? "No applications yet" : "Nothing in this view"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {applications.length === 0
                ? "Find a home you love and apply — it will show up here."
                : "Change the filter to see your other applications."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell className="font-medium">
                      <Link href={`/properties/${app.propertyId}`} className="hover:underline">
                        {app.propertyTitle}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{app.applicantName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(app.submittedAt)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`${statusClass[app.status]} gap-1 capitalize hover:opacity-100`}
                      >
                        {statusIcon[app.status]}
                        {app.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {app.status === "pending" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full text-muted-foreground"
                          onClick={() => handleCancel(app.id, app.propertyTitle)}
                        >
                          Withdraw
                        </Button>
                      )}
                      {app.status !== "pending" && (
                        <span className="text-xs text-muted-foreground">
                          {app.status === "approved" && app.decidedAt
                            ? `Decided ${formatDate(app.decidedAt)}`
                            : ""}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </DashboardShell>
  );
};

export default TenantApplicationsPage;
