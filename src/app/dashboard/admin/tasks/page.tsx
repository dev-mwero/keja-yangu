"use client";

import { CheckCircle2, ClipboardList, Clock, Loader2, Plus, Wrench } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/DashboardShell";
import { SearchInput } from "@/components/SearchInput";
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
import { adminNav as nav } from "@/config/dashboardNav";
import type { TaskPriority, TaskStatus } from "@/data/dashboard";
import { caretakers } from "@/data/properties";
import { useProperties } from "@/hooks/use-properties";
import { useTaskMutations, useTasks } from "@/hooks/use-tasks";
import { formatDate } from "@/lib/format";
import { matchesQuery } from "@/lib/search";

const statusClass: Record<TaskStatus, string> = {
  open: "bg-warning/15 text-warning",
  "in-progress": "bg-primary/15 text-primary",
  done: "bg-success/15 text-success",
};

const priorityClass: Record<TaskPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-warning/15 text-warning",
  high: "bg-destructive/15 text-destructive",
};

type Filter = "open" | "in-progress" | "done";

const AdminTasksPage = () => {
  const { properties } = useProperties();
  const { items, loading, error, refetch } = useTasks();
  const { createTask, updateTask, pending } = useTaskMutations();

  const [filter, setFilter] = useState<Filter>("open");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [property, setProperty] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const openCount = items.filter((t) => t.status === "open").length;
  const inProgressCount = items.filter((t) => t.status === "in-progress").length;
  const doneCount = items.filter((t) => t.status === "done").length;
  const visible = items
    .filter((t) => t.status === filter)
    .filter((t) =>
      matchesQuery(query, t.title, t.property, t.assignedTo, t.notes, t.priority, t.status),
    );

  const submit = async () => {
    if (!title.trim()) {
      toast.error("Task title is required");
      return;
    }
    const assigned = caretakers.find((c) => c.id === assignee);
    try {
      await createTask({
        title: title.trim(),
        propertyId: property || undefined,
        priority,
        status: "open",
        assignedTo: assigned?.name ?? "Caretaker",
        assignedToName: assigned?.name ?? "",
        dueDate: dueDate ? `${dueDate}T23:59:59` : new Date().toISOString(),
        notes: notes.trim() || undefined,
      });
      toast.success("Task created", {
        description: assigned ? `Assigned to ${assigned.name}.` : "Task added.",
      });
      setTitle("");
      setProperty("");
      setAssignee("");
      setDueDate("");
      setNotes("");
      setOpen(false);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create task");
    }
  };

  const advance = async (t: { _id: string; status: TaskStatus }) => {
    const next: TaskStatus =
      t.status === "open" ? "in-progress" : t.status === "in-progress" ? "done" : "open";
    try {
      await updateTask(t._id, { status: next });
      toast.success(`Task moved to ${next}`);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update task");
    }
  };

  return (
    <DashboardShell
      roleName="Admin"
      nav={nav}
      title="Tasks & Maintenance"
      subtitle="Assign repairs, follow up with caretakers, and resolve issues fast."
    >
      <div className="mb-6 flex justify-end">
        <Button className="rounded-full" onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Assign task
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Open tasks" value={openCount} icon={ClipboardList} />
        <StatCard label="In progress" value={inProgressCount} icon={Clock} />
        <StatCard label="Resolved" value={doneCount} icon={CheckCircle2} />
      </div>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="open">Open ({openCount})</TabsTrigger>
            <TabsTrigger value="in-progress">In progress ({inProgressCount})</TabsTrigger>
            <TabsTrigger value="done">Resolved ({doneCount})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="w-full sm:w-72">
          <SearchInput
            placeholder="Search by title, property, assignee…"
            value={query}
            onChange={setQuery}
          />
        </div>
      </div>

      {loading && (
        <div className="mt-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading tasks…
        </div>
      )}
      {error && (
        <div className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="mt-6 space-y-3">
        {!loading && visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            No {filter} tasks match your query.
          </div>
        ) : (
          visible.map((t) => (
            <div
              key={t._id}
              className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft transition-all hover:border-primary/40 md:flex-row md:items-center md:justify-between"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-foreground">{t.title}</h4>
                  <Badge variant="outline" className={priorityClass[t.priority as TaskPriority]}>
                    {t.priority}
                  </Badge>
                  <Badge variant="outline" className={statusClass[t.status as TaskStatus]}>
                    {t.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t.property || "—"} · Assigned to {t.assignedTo || "—"} · Due{" "}
                  {formatDate(t.dueDate)}
                </p>
                {t.notes && <p className="text-xs text-muted-foreground/80 italic">{t.notes}</p>}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={pending}
                  onClick={() => advance({ _id: t._id, status: t.status as TaskStatus })}
                >
                  <Wrench className="mr-1.5 h-3.5 w-3.5" />
                  {t.status === "open"
                    ? "Start task"
                    : t.status === "in-progress"
                      ? "Mark done"
                      : "Reopen"}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Assign a maintenance task</DialogTitle>
            <DialogDescription>
              Assign repairs, inspections, or turns to your on-site caretakers.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="text-sm font-medium text-muted-foreground">Title</div>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Fix leaking pipe in Unit 4B"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="text-sm font-medium text-muted-foreground">Property</div>
                <Select value={property} onValueChange={setProperty}>
                  <SelectTrigger>
                    <SelectValue placeholder="All properties" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p._id} value={p._id}>
                        {p.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <div className="text-sm font-medium text-muted-foreground">Assign to</div>
                <Select value={assignee} onValueChange={setAssignee}>
                  <SelectTrigger>
                    <SelectValue placeholder="Caretaker" />
                  </SelectTrigger>
                  <SelectContent>
                    {caretakers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="text-sm font-medium text-muted-foreground">Priority</div>
                <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
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
              <div className="space-y-1.5">
                <div className="text-sm font-medium text-muted-foreground">Due date</div>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="text-sm font-medium text-muted-foreground">Notes</div>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Vendor details or instructions…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="rounded-full" disabled={pending} onClick={submit}>
              {pending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Assign task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
};

export default AdminTasksPage;
