import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const rows = [
  { id: "r1", property: "Sunlit Studio in Kilimani", date: "2025-03-20", status: "approved" },
  { id: "r2", property: "Terracotta Loft, Westlands", date: "2025-04-02", status: "pending" },
  { id: "r3", property: "Skyline Penthouse", date: "2025-04-10", status: "rejected" },
] as const;

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

export const ApplicationsSection = () => (
  <div className="overflow-hidden rounded-xl border border-border">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Property</TableHead>
          <TableHead>Submitted</TableHead>
          <TableHead className="text-right">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-medium">{r.property}</TableCell>
            <TableCell className="text-muted-foreground">{r.date}</TableCell>
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
);