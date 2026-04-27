import { useState } from "react";
import { Building2, Users, CheckCircle2, XCircle, Clock } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { properties as initialProps, tenants } from "@/data/properties";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { caretakerNav as nav } from "@/config/dashboardNav";

const CaretakerDashboard = () => {
  const [props, setProps] = useState(initialProps.filter((p) => p.caretakerIds.includes("c1")));
  const [reqs, setReqs] = useState(tenants.filter((t) => t.status === "pending"));
  const { toast } = useToast();

  const handle = (id: string, action: "approved" | "rejected") => {
    setReqs((r) => r.filter((x) => x.id !== id));
    toast({ title: `Request ${action}`, description: "Tenant has been notified." });
  };

  const updateStatus = (id: string, status: typeof initialProps[number]["status"]) => {
    setProps((p) => p.map((x) => (x.id === id ? { ...x, status } : x)));
    toast({ title: "Status updated", description: `Property marked as ${status}.` });
  };

  const occupied = props.filter((p) => p.status === "occupied").length;
  const vacant = props.filter((p) => p.status === "available").length;

  return (
    <DashboardShell role="Caretaker" nav={nav} title="Hello, John" subtitle="Manage your properties and tenant requests.">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Assigned properties" value={props.length} icon={Building2} />
        <StatCard label="Tenants" value={3} icon={Users} delay={0.05} />
        <StatCard label="Occupied" value={occupied} icon={CheckCircle2} delay={0.1} />
        <StatCard label="Vacant" value={vacant} icon={Clock} delay={0.15} />
      </div>

      <div className="mt-10">
        <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight">Pending requests</h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reqs.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">All caught up — no pending requests.</TableCell></TableRow>
              ) : reqs.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-muted-foreground">{t.email}</TableCell>
                  <TableCell className="text-muted-foreground">{t.joined}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => handle(t.id, "rejected")}><XCircle className="mr-1 h-4 w-4" />Reject</Button>
                    <Button size="sm" onClick={() => handle(t.id, "approved")}><CheckCircle2 className="mr-1 h-4 w-4" />Approve</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="mt-10">
        <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight">Property status</h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Property</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Current</TableHead>
                <TableHead className="text-right">Update</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.title}</TableCell>
                  <TableCell className="text-muted-foreground">{p.location}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{p.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Select value={p.status} onValueChange={(v) => updateStatus(p.id, v as typeof p.status)}>
                      <SelectTrigger className="ml-auto w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="available">Available</SelectItem>
                        <SelectItem value="occupied">Occupied</SelectItem>
                        <SelectItem value="maintenance">Maintenance</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardShell>
  );
};

export default CaretakerDashboard;