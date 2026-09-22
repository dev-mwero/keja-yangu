"use client";

import { Megaphone, Pin, Plus, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/DashboardShell";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ownerNav as nav } from "@/config/dashboardNav";
import { type Announcement, announcementsStore } from "@/data/dashboard";
import { useLocalStore } from "@/hooks/use-local-store";
import { formatDate, relativeTime } from "@/lib/format";

const OwnerCommunicationsPage = () => {
  const { items, addItem, removeItem } = useLocalStore<Announcement>(announcementsStore);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Announcement["audience"]>("tenants");
  const [pinned, setPinned] = useState(false);

  const sorted = [...items].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  const submit = () => {
    if (!title.trim() || !body.trim()) {
      toast.error("Title and message are required");
      return;
    }
    const announcement: Announcement = {
      id: `ann-${Date.now()}`,
      title: title.trim(),
      body: body.trim(),
      author: "D8 Property Group",
      property: "All properties",
      createdAt: new Date().toISOString(),
      pinned,
      audience,
    };
    addItem(announcement);
    toast.success("Announcement sent", {
      description: `Published to ${audience === "all" ? "everyone" : "all tenants"}.`,
    });
    setTitle("");
    setBody("");
    setPinned(false);
    setOpen(false);
  };

  const remove = (announcement: Announcement) => {
    removeItem(announcement.id);
    toast.info("Announcement removed");
  };

  return (
    <DashboardShell
      roleName="Owner"
      nav={nav}
      title="Communications"
      subtitle="Broadcast announcements to tenants across the portfolio."
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold">Announcements</h2>
          <p className="text-sm text-muted-foreground">
            {items.length} published · tenants see these on their dashboard
          </p>
        </div>
        <Button className="rounded-full" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          New announcement
        </Button>
      </div>

      <div className="mt-6 space-y-4">
        {sorted.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
            <Megaphone className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 font-display text-xl">No announcements yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Publish the first one — tenants will see it instantly.
            </p>
          </div>
        ) : (
          sorted.map((a) => (
            <article
              key={a.id}
              className="rounded-2xl border border-border bg-card p-6 shadow-soft"
            >
              <div className="flex flex-wrap items-center gap-2">
                {a.pinned && (
                  <Badge className="gap-1 bg-primary/10 text-primary hover:opacity-100">
                    <Pin className="h-3 w-3" />
                    Pinned
                  </Badge>
                )}
                <Badge variant="outline" className="capitalize">
                  {a.audience === "all" ? "Everyone" : "Tenants"}
                </Badge>
                <span className="ml-auto text-xs text-muted-foreground">
                  {relativeTime(a.createdAt)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(a)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <h3 className="mt-3 font-display text-xl font-semibold tracking-tight">{a.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{a.body}</p>
              <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                {a.author} · posted {formatDate(a.createdAt)}
              </p>
            </article>
          ))
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New announcement</DialogTitle>
            <DialogDescription>Tenants will see this in their dashboard.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="text-sm font-medium text-muted-foreground">Title</div>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Security guard shift change"
              />
            </div>
            <div className="space-y-1.5">
              <div className="text-sm font-medium text-muted-foreground">Message</div>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                placeholder="Write the announcement…"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1.5 flex-1">
                <div className="text-sm font-medium text-muted-foreground">Audience</div>
                <Select
                  value={audience}
                  onValueChange={(v) => setAudience(v as Announcement["audience"])}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tenants">Tenants only</SelectItem>
                    <SelectItem value="all">Everyone</SelectItem>
                    <SelectItem value="staff">Staff only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={pinned} onCheckedChange={setPinned} />
                <span className="text-sm text-muted-foreground">Pin</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="rounded-full" onClick={submit}>
              <Send className="h-4 w-4" />
              Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
};

export default OwnerCommunicationsPage;
