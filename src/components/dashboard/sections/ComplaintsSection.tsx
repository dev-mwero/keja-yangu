import { useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface Complaint {
  id: string;
  title: string;
  category: string;
  status: "open" | "in-progress" | "resolved";
  created: string;
}

const seed: Complaint[] = [
  { id: "c1", title: "Hot water cuts off in mornings", category: "Plumbing", status: "in-progress", created: "2025-04-22" },
  { id: "c2", title: "Noisy neighbour past 11pm", category: "Community", status: "open", created: "2025-04-26" },
];

const statusClass: Record<Complaint["status"], string> = {
  open: "bg-warning/15 text-warning",
  "in-progress": "bg-primary/15 text-primary",
  resolved: "bg-success/15 text-success",
};

export const ComplaintsSection = () => {
  const [items, setItems] = useState<Complaint[]>(seed);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [details, setDetails] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setItems((prev) => [
      { id: `c${Date.now()}`, title, category: category || "General", status: "open", created: new Date().toISOString().slice(0, 10) },
      ...prev,
    ]);
    setTitle(""); setCategory(""); setDetails(""); setOpen(false);
    toast.success("Complaint submitted", { description: "Your caretaker has been notified." });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{items.length} on record</p>
        <Button size="sm" onClick={() => setOpen((v) => !v)}>
          <Plus className="mr-1.5 h-4 w-4" />New complaint
        </Button>
      </div>

      {open && (
        <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-muted/40 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ct">Title</Label>
              <Input id="ct" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Brief summary" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cc">Category</Label>
              <Input id="cc" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Plumbing, Noise, …" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cd">Details</Label>
            <Textarea id="cd" value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Tell us what happened" rows={3} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm">Submit</Button>
          </div>
        </form>
      )}

      <ul className="space-y-2">
        {items.map((c) => (
          <li key={c.id} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10 text-warning">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <p className="font-medium">{c.title}</p>
                <p className="text-xs text-muted-foreground">{c.category} · {c.created}</p>
              </div>
            </div>
            <Badge className={`${statusClass[c.status]} capitalize hover:opacity-100`}>{c.status.replace("-", " ")}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
};