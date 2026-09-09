"use client";

import Link from "next/link";
import { FileText, Clock, CheckCircle2, XCircle } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { tenantNav } from "@/config/dashboardNav";
import { StatCard } from "@/components/StatCard";
import { PropertyCard } from "@/components/PropertyCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { properties } from "@/data/properties";
import { useAuth } from "@/hooks/use-auth";
import { useTenantApplications } from "@/hooks/use-applications";
import { ApplicationStatus } from "@/lib/applications";

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

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
};

const TenantDashboard = () => {
  const { user } = useAuth();
  const { applications } = useTenantApplications(user?.email);
  const recommended = properties.filter((p) => p.status === "available").slice(0, 3);

  const pendingCount = applications.filter((a) => a.status === "pending").length;
  const approvedCount = applications.filter((a) => a.status === "approved").length;
  const totalCount = applications.length;
  const approvedTitle = applications.find((a) => a.status === "approved")?.propertyTitle;
  const recent = applications.slice(0, 5);

  return (
    <DashboardShell role="Tenant" nav={tenantNav} title={`Welcome back${user?.name ? `, ${user.name}` : ""}`} subtitle="Track your applications and discover new homes.">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total applications" value={totalCount} icon={FileText} />
        <StatCard label="Pending review" value={pendingCount} icon={Clock} hint="Avg. response 18h" />
        <StatCard label="Approved" value={approvedCount} hint={approvedTitle} icon={CheckCircle2} />
      </div>

      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Your requests</h2>
        </div>
        {recent.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 font-display text-xl">No applications yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Find a home you love and apply — we&apos;ll track the response here.</p>
            <Button asChild className="mt-5 rounded-full"><Link href="/properties">Browse properties</Link></Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      <Link href={`/properties/${r.propertyId}`} className="hover:underline">{r.propertyTitle}</Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(r.submittedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Badge className={`${statusClass[r.status]} gap-1 capitalize hover:opacity-100`}>
                        {statusIcon[r.status]}{r.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="mt-12">
        <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight">Recommended for you</h2>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {recommended.map((p, i) => <PropertyCard key={p.id} property={p} index={i} />)}
        </div>
      </div>
    </DashboardShell>
  );
};

export default TenantDashboard;
