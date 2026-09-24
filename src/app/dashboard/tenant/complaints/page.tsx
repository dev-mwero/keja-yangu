"use client";

import { AlertTriangle, CheckCircle2, Clock, Plus, Wrench } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/DashboardShell";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { tenantNav } from "@/config/dashboardNav";
import { useComplaintMutations, useComplaints } from "@/hooks/use-complaints";
import type { ComplaintCategory, ComplaintPriority, ComplaintStatus } from "@/lib/domain-enums";
import { relativeTime } from "@/lib/format";

const statusClass: Record<ComplaintStatus, string> = {
  open: "bg-warning/15 text-warning",
  "in-progress": "bg-primary/15 text-primary",
  resolved: "bg-success/15 text-success",
};

const priorityClass: Record<ComplaintPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-warning/15 text-warning",
  high: "bg-destructive/15 text-destructive",
};

const categories: ComplaintCategory[] = [
  "Maintenance",
  "Noise",
  "Billing",
  "Security",
  "Neighbours",
  "Other",
];

type Filter = "all" | ComplaintStatus;

const TenantComplaintsPage = () => {
  const { items, refetch } = useComplaints();
  const { createComplaint, pending } = useComplaintMutations();
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<ComplaintCategory>("Maintenance");
  const [priority, setPriority] = useState<ComplaintPriority>("medium");
  const [message, setMessage] = useState("");

  const openCount = items.filter((c) => c.status === "open").length;
  const progressCount = items.filter((c) => c.status === "in-progress").length;
  const resolvedCount = items.filter((c) => c.status === "resolved").length;
  const visible = filter === "all" ? items : items.filter((c) => c.status === filter);

  // Single-property tenants pin their property server-side; the page only
  // hints the property when the loaded complaints resolve to exactly one.
  const knownPropertyIds = [...new Set(items.map((c) => c.propertyId).filter(Boolean))];
  const propertyId = knownPropertyIds.length === 1 ? knownPropertyIds[0] : undefined;

  const submit = async () => {
    if (!subject.trim()) {
      toast.error("Subject is required");
      return;
    }
    try {
      await createComplaint({
        subject: subject.trim(),
        category,
        priority,
        message: message.trim() || "—",
        propertyId,
      });
      toast.success("Complaint logged", {
        description: "The caretaker has been notified and will follow up.",
      });
      setSubject("");
      setMessage("");
      setOpen(false);
      void refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit complaint");
    }
  };

  const counts: Record<Filter, number> = {
    all: items.length,
    open: openCount,
    "in-progress": progressCount,
    resolved: resolvedCount,
  };

  return (
    <DashboardShell
      roleName="Tenant"
      nav={tenantNav}
      title="Complaints"
      subtitle="Log issues and track them until they're resolved."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Open" value={openCount} icon={AlertTriangle} />
        <StatCard label="In progress" value={progressCount} icon={Clock} />
        <StatCard label="Resolved" value={resolvedCount} icon={CheckCircle2} />
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            {(["all", "open", "in-progress", "resolved"] as const).map((f) => (
              <TabsTrigger key={f} value={f}>
                {f === "all" ? "All" : f}
                <span className="ml-1.5 text-xs text-muted-foreground">{counts[f]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button className="rounded-full" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          Log a complaint
        </Button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center md:col-span-2">
            <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 font-display text-xl">No complaints here</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Nothing in this view. Log a complaint and it will show up here.
            </p>
          </div>
        ) : (
          visible.map((c) => (
            <div key={c._id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Wrench className="h-5 w-5" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge className={`${statusClass[c.status]} capitalize hover:opacity-100`}>
                    {c.status}
                  </Badge>
                  <Badge variant="outline" className={`capitalize ${priorityClass[c.priority]}`}>
                    {c.priority}
                  </Badge>
                </div>
              </div>
              <h3 className="mt-3 font-display text-lg font-semibold">{c.subject}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {c.category} · {c.property} · {relativeTime(c.createdAt)}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">{c.message}</p>
              {c.status === "resolved" && c.resolution && (
                <p className="mt-4 rounded-xl bg-success/10 p-3 text-sm text-success">
                  {c.resolution}
                </p>
              )}
            </div>
          ))
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log a complaint</DialogTitle>
            <DialogDescription>
              Tell us what's wrong and how urgent it is. The caretaker will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="text-sm font-medium text-muted-foreground">Subject</div>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Leaking kitchen sink"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="text-sm font-medium text-muted-foreground">Category</div>
                <Select value={category} onValueChange={(v) => setCategory(v as ComplaintCategory)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <div className="text-sm font-medium text-muted-foreground">Priority</div>
                <Select value={priority} onValueChange={(v) => setPriority(v as ComplaintPriority)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="text-sm font-medium text-muted-foreground">Details</div>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder="Describe the issue…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="rounded-full" onClick={() => void submit()} disabled={pending}>
              Submit complaint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
};

export default TenantComplaintsPage;
