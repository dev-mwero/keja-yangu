import { FileBarChart, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

const reports = [
  { id: "r1", name: "Occupancy report", period: "April 2025" },
  { id: "r2", name: "Rent collection", period: "April 2025" },
  { id: "r3", name: "Maintenance spend", period: "Q1 2025" },
  { id: "r4", name: "Tenant turnover", period: "Q1 2025" },
];

export const ReportsSection = () => (
  <div className="grid gap-3 sm:grid-cols-2">
    {reports.map((r) => (
      <div key={r.id} className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileBarChart className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium">{r.name}</p>
            <p className="text-xs text-muted-foreground">{r.period}</p>
          </div>
        </div>
        <Button size="sm" variant="outline"><Download className="mr-1.5 h-4 w-4" />Export</Button>
      </div>
    ))}
  </div>
);