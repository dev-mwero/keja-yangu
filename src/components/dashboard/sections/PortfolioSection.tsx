import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { properties } from "@/data/properties";

interface Props {
  /** Optional caretaker id — when set, restrict portfolio to assigned properties */
  caretakerId?: string;
}

export const PortfolioSection = ({ caretakerId }: Props) => {
  const list = caretakerId
    ? properties.filter((p) => p.caretakerIds.includes(caretakerId))
    : properties;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total" value={list.length} />
        <Stat label="Occupied" value={list.filter((p) => p.status === "occupied").length} />
        <Stat label="Available" value={list.filter((p) => p.status === "available").length} />
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  <Building2 className="mx-auto mb-2 h-5 w-5" />
                  No properties in this portfolio yet.
                </TableCell>
              </TableRow>
            ) : (
              list.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.title}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">{p.type}</TableCell>
                  <TableCell className="text-muted-foreground">{p.location}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline" className="capitalize">{p.status}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-xl border border-border bg-muted/40 p-4">
    <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
    <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
  </div>
);