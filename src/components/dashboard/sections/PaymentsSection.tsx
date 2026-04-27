import { CreditCard, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const history = [
  { id: "p1", ref: "RCT-0421", date: "2025-04-01", amount: "KES 38,000", method: "M-Pesa", status: "Paid" },
  { id: "p2", ref: "RCT-0322", date: "2025-03-01", amount: "KES 38,000", method: "Bank", status: "Paid" },
  { id: "p3", ref: "RCT-0223", date: "2025-02-01", amount: "KES 38,000", method: "M-Pesa", status: "Paid" },
];

export const PaymentsSection = () => (
  <div className="space-y-6">
    <div className="grid gap-3 sm:grid-cols-3">
      <Stat label="Next rent due" value="May 1, 2025" />
      <Stat label="Amount" value="KES 38,000" />
      <Stat label="Status" value="On time" tone="ok" />
    </div>

    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <CreditCard className="h-5 w-5" />
      </div>
      <div className="mr-auto">
        <p className="font-medium">Pay rent</p>
        <p className="text-xs text-muted-foreground">M-Pesa Paybill 4421888 · Account: your unit number</p>
      </div>
      <Button size="sm">Pay now</Button>
    </div>

    <div className="overflow-hidden rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Receipt</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Method</TableHead>
            <TableHead className="text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {history.map((h) => (
            <TableRow key={h.id}>
              <TableCell className="font-medium">{h.ref}</TableCell>
              <TableCell className="text-muted-foreground">{h.date}</TableCell>
              <TableCell>{h.amount}</TableCell>
              <TableCell className="text-muted-foreground">{h.method}</TableCell>
              <TableCell className="text-right">
                <Badge className="bg-success/15 text-success hover:opacity-100">{h.status}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>

    <Button variant="outline" size="sm"><Download className="mr-1.5 h-4 w-4" />Download statement</Button>
  </div>
);

const Stat = ({ label, value, tone }: { label: string; value: string; tone?: "ok" }) => (
  <div className="rounded-xl border border-border bg-muted/40 p-4">
    <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
    <p className={`mt-1 font-display text-2xl font-semibold ${tone === "ok" ? "text-success" : ""}`}>{value}</p>
  </div>
);