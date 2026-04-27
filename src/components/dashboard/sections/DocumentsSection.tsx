import { FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

const docs = [
  { id: "d1", name: "Lease agreement", date: "Signed Jan 12, 2025" },
  { id: "d2", name: "Move-in inspection", date: "Jan 14, 2025" },
  { id: "d3", name: "House rules", date: "Updated Mar 2025" },
  { id: "d4", name: "Rent receipts (2025)", date: "Auto-generated" },
];

export const DocumentsSection = () => (
  <ul className="grid gap-3 sm:grid-cols-2">
    {docs.map((d) => (
      <li key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium">{d.name}</p>
            <p className="text-xs text-muted-foreground">{d.date}</p>
          </div>
        </div>
        <Button size="sm" variant="outline"><Download className="mr-1.5 h-4 w-4" />Download</Button>
      </li>
    ))}
  </ul>
);