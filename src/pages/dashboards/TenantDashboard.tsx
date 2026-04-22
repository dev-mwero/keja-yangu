import { Home, Search, FileText, Settings, Clock, CheckCircle2, XCircle } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { StatCard } from "@/components/StatCard";
import { PropertyCard } from "@/components/PropertyCard";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { properties } from "@/data/properties";

const nav = [
  { to: "/dashboard/tenant", label: "Overview", icon: Home },
  { to: "/properties", label: "Browse", icon: Search },
  { to: "/dashboard/tenant", label: "My requests", icon: FileText },
  { to: "/dashboard/tenant", label: "Settings", icon: Settings },
];

const myRequests = [
  { id: "r1", property: "Sunlit Studio in Kilimani", date: "2025-03-20", status: "approved" },
  { id: "r2", property: "Terracotta Loft, Westlands", date: "2025-04-02", status: "pending" },
  { id: "r3", property: "Skyline Penthouse", date: "2025-04-10", status: "rejected" },
];

const statusIcon = {
  approved: <CheckCircle2 className="h-3.5 w-3.5" />,
  pending: <Clock className="h-3.5 w-3.5" />,
  rejected: <XCircle className="h-3.5 w-3.5" />,
} as const;

const statusClass = {
  approved: "bg-success/15 text-success",
  pending: "bg-warning/15 text-warning",
  rejected: "bg-destructive/15 text-destructive",
} as const;

const TenantDashboard = () => {
  const recommended = properties.filter((p) => p.status === "available").slice(0, 3);

  return (
    <DashboardShell role="Tenant" nav={nav} title="Welcome back, Amina" subtitle="Track your applications and discover new homes.">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Active applications" value={1} icon={FileText} delay={0} />
        <StatCard label="Pending review" value={1} icon={Clock} delay={0.05} hint="Avg. response 18h" />
        <StatCard label="Approved" value={1} hint="Sunlit Studio" icon={CheckCircle2} delay={0.1} />
      </div>

      <div className="mt-10">
        <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight">Your requests</h2>
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
              {myRequests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.property}</TableCell>
                  <TableCell className="text-muted-foreground">{r.date}</TableCell>
                  <TableCell className="text-right">
                    <Badge className={`${statusClass[r.status as keyof typeof statusClass]} gap-1 capitalize hover:opacity-100`}>
                      {statusIcon[r.status as keyof typeof statusIcon]}{r.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
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