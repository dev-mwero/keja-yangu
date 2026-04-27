const rows = [
  { id: "i1", ref: "INV-2025-0421", tenant: "Amina K.", amount: "KES 38,000", due: "2025-05-01", status: "Paid" },
  { id: "i2", ref: "INV-2025-0422", tenant: "Brian O.", amount: "KES 45,000", due: "2025-05-01", status: "Pending" },
  { id: "i3", ref: "INV-2025-0423", tenant: "Cynthia W.", amount: "KES 52,500", due: "2025-05-05", status: "Overdue" },
];

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const statusVariant: Record<string, string> = {
  Paid: "bg-success/15 text-success",
  Pending: "bg-warning/15 text-warning",
  Overdue: "bg-destructive/15 text-destructive",
};

export const AccountingSection = () => {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Collected (MTD)" value="KES 1.24M" />
        <Stat label="Outstanding" value="KES 97,500" />
        <Stat label="Overdue" value="KES 52,500" tone="danger" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Tenant</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.ref}</TableCell>
                <TableCell className="text-muted-foreground">{r.tenant}</TableCell>
                <TableCell>{r.amount}</TableCell>
                <TableCell className="text-muted-foreground">{r.due}</TableCell>
                <TableCell className="text-right">
                  <Badge className={`${statusVariant[r.status]} hover:opacity-100`}>{r.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

const Stat = ({ label, value, tone }: { label: string; value: string; tone?: "danger" }) => (
  <div className="rounded-xl border border-border bg-muted/40 p-4">
    <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
    <p className={`mt-1 font-display text-2xl font-semibold ${tone === "danger" ? "text-destructive" : ""}`}>{value}</p>
  </div>
);