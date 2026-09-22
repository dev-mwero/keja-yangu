"use client";

import { CheckCircle2, ClipboardList, Clock, Plus, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
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
import { caretakerNav as nav } from "@/config/dashboardNav";
import {
  type MaintenanceTask,
  type TaskPriority,
  type TaskStatus,
  tasksStore,
} from "@/data/dashboard";
import { caretakers } from "@/data/properties";
import { useAuth } from "@/hooks/use-auth";
import { useLocalStore } from "@/hooks/use-local-store";
import { useProperties } from "@/hooks/use-properties";
import { formatDate } from "@/lib/format";

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

const CaretakerTasksPage = () => {
  const { user } = useAuth();
  const caretaker = useMemo(() => caretakers.find((c) => c.email === user?.email), [user?.email]);
  const caretakerName = caretaker?.name ?? user?.name ?? "Caretaker";

  const { properties } = useProperties();
  const { items, addItem, updateItem } = useLocalStore<MaintenanceTask>(tasksStore);

  const [filter, setFilter] = useState<Filter>("open");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [property, setProperty] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const openCount = items.filter((t) => t.status === "open").length;
  const inProgressCount = items.filter((t) => t.status === "in-progress").length;
  const doneCount = items.filter((t) => t.status === "done").length;
  const visible = items.filter((t) => t.status === filter);

  const submit = () => {
    if (!title.trim()) {
      toast.error("Task title is required");
      return;
    }
    addItem({
      id: `task-${Date.now()}`,
      title: title.trim(),
      property: properties.find((p) => p._id === property)?.title ?? "All properties",
      propertyId: property || undefined,
      priority,
      status: "open",
      assignedTo: caretakerName,
      createdBy: "caretaker",
      dueDate: dueDate ? `${dueDate}T23:59:59` : new Date().toISOString(),
      createdAt: new Date().toISOString(),
      notes: notes.trim() || undefined,
    });
    toast.success("Task created", { description: `${title.trim()} has been assigned to you.` });
    setTitle("");
    setNotes("");
    setOpen(false);
  };

  const setStatus = (id: string, status: TaskStatus) => {
    updateItem(id, (task) => ({
      ...task,
      status,
      completedAt: status === "done" ? new Date().toISOString() : undefined,
    }));
    toast.success(status === "done" ? "Task completed" : `Task moved to ${status}`);
  };

  const counts: Record<Filter, number> = {
    open: openCount,
    "in-progress": inProgressCount,
    done: doneCount,
  };

  return (
    <DashboardShell
      roleName="Caretaker"
      nav={nav}
      title="Tasks & Maintenance"
      subtitle="Keep maintenance work moving across your properties."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Open" value={openCount} icon={Clock} />
        <StatCard label="In progress" value={inProgressCount} icon={Wrench} />
        <StatCard label="Completed" value={doneCount} icon={CheckCircle2} />
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            {(["open", "in-progress", "done"] as const).map((f) => (
              <TabsTrigger key={f} value={f}>
                {f === "open" ? "Open" : f === "done" ? "Completed" : "In progress"}
                <span className="ml-1.5 text-xs text-muted-foreground">{counts[f]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button className="rounded-full" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          New task
        </Button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center md:col-span-3">
            <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 font-display text-xl">
              {filter === "done" ? "No completed tasks yet" : "Nothing in this view"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {filter === "done"
                ? "Tasks you finish will land here."
                : "Create a task to keep maintenance on track."}
            </p>
          </div>
        ) : (
          visible.map((task) => (
            <div
              key={task.id}
              className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-soft"
            >
              <div className="flex items-start justify-between gap-3">
                <Badge className={`${priorityClass[task.priority]} capitalize hover:opacity-100`}>
                  {task.priority} priority
                </Badge>
                <Badge className={`${statusClass[task.status]} capitalize hover:opacity-100`}>
                  {task.status}
                </Badge>
              </div>
              <h3 className="mt-3 font-display text-lg font-semibold leading-snug">{task.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{task.property}</p>
              {task.notes && <p className="mt-3 text-sm text-muted-foreground">{task.notes}</p>}
              <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                <span>
                  Due {formatDate(task.dueDate)}
                  {task.completedAt ? ` · done ${formatDate(task.completedAt)}` : ""}
                </span>
                <span className="font-medium text-foreground">{task.assignedTo}</span>
              </div>
              <div className="mt-4 flex gap-2">
                {task.status !== "done" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 rounded-full"
                    onClick={() =>
                      setStatus(task.id, task.status === "open" ? "in-progress" : "open")
                    }
                  >
                    {task.status === "open" ? "Start work" : "Reopen"}
                  </Button>
                )}
                {task.status !== "done" ? (
                  <Button
                    size="sm"
                    className="flex-1 rounded-full"
                    onClick={() => setStatus(task.id, "done")}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Mark done
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 rounded-full"
                    onClick={() => setStatus(task.id, "open")}
                  >
                    Reopen
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New maintenance task</DialogTitle>
            <DialogDescription>
              Assign work to yourself or a vendor for one of your properties.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="text-sm font-medium text-muted-foreground">Title</div>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Repair lobby gate"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="text-sm font-medium text-muted-foreground">Property</div>
                <Select value={property} onValueChange={setProperty}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select property" />
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
            </div>
            <div className="space-y-1.5">
              <div className="text-sm font-medium text-muted-foreground">Due date</div>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <div className="text-sm font-medium text-muted-foreground">Notes</div>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Any instructions or vendor details…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="rounded-full" onClick={submit}>
              Create task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
};

export default CaretakerTasksPage;
