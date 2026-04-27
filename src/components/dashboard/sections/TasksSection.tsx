import { useState } from "react";
import { Wrench, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Task {
  id: string;
  title: string;
  property: string;
  priority: "low" | "medium" | "high";
  status: "open" | "in-progress" | "done";
}

const seed: Task[] = [
  { id: "t1", title: "Leaky kitchen tap", property: "Sunlit Studio", priority: "medium", status: "open" },
  { id: "t2", title: "Stairwell light replacement", property: "Terracotta Loft", priority: "low", status: "in-progress" },
  { id: "t3", title: "Annual fire-safety check", property: "Skyline Penthouse", priority: "high", status: "open" },
];

const priorityClass: Record<Task["priority"], string> = {
  low: "bg-muted text-foreground",
  medium: "bg-warning/15 text-warning",
  high: "bg-destructive/15 text-destructive",
};

export const TasksSection = () => {
  const [tasks] = useState<Task[]>(seed);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{tasks.length} active items</p>
        <Button size="sm"><Plus className="mr-1.5 h-4 w-4" />New task</Button>
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Property</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-2">
                    <Wrench className="h-3.5 w-3.5 text-muted-foreground" />{t.title}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{t.property}</TableCell>
                <TableCell>
                  <Badge className={`${priorityClass[t.priority]} capitalize hover:opacity-100`}>{t.priority}</Badge>
                </TableCell>
                <TableCell className="text-right capitalize text-muted-foreground">{t.status}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};