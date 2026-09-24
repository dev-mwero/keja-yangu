"use client";

import { Megaphone, Pin } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { tenantNav } from "@/config/dashboardNav";
import { useAnnouncements } from "@/hooks/use-announcements";
import { formatDate, relativeTime } from "@/lib/format";
import type { Announcement } from "@/types/communications";

const isRecent = (createdAt: string) => Date.now() - new Date(createdAt).getTime() < 3 * 86400000;

const TenantAnnouncementsPage = () => {
  const { items } = useAnnouncements();
  const sorted = [...items].sort((a: Announcement, b: Announcement) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });

  return (
    <DashboardShell
      roleName="Tenant"
      nav={tenantNav}
      title="Announcements"
      subtitle="Updates from your landlord and caretaker."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <p className="text-sm text-muted-foreground">Recent updates</p>
          <p className="mt-2 font-display text-3xl font-semibold tracking-tight">
            {items.filter((a) => isRecent(a.createdAt ?? "")).length}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <p className="text-sm text-muted-foreground">Pinned</p>
          <p className="mt-2 font-display text-3xl font-semibold tracking-tight">
            {items.filter((a) => a.pinned).length}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <p className="text-sm text-muted-foreground">All announcements</p>
          <p className="mt-2 font-display text-3xl font-semibold tracking-tight">{items.length}</p>
        </div>
      </div>

      <div className="mt-8 space-y-4">
        {sorted.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
            <Megaphone className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 font-display text-xl">No announcements yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              New updates from the property team will show up here.
            </p>
          </div>
        ) : (
          sorted.map((a) => (
            <article
              key={a._id}
              className="rounded-2xl border border-border bg-card p-6 shadow-soft"
            >
              <div className="flex flex-wrap items-center gap-2">
                {a.pinned && (
                  <Badge className="gap-1 bg-primary/10 text-primary hover:opacity-100">
                    <Pin className="h-3 w-3" />
                    Pinned
                  </Badge>
                )}
                {isRecent(a.createdAt ?? "") && (
                  <Badge variant="outline" className="text-success">
                    New
                  </Badge>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {a.audience === "all" ? "Everyone" : "Tenants"} · {relativeTime(a.createdAt)}
                </span>
              </div>
              <h3 className="mt-3 font-display text-xl font-semibold tracking-tight">{a.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{a.body}</p>
              <div className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{a.author}</span>
                <span>·</span>
                <span>{a.property}</span>
                <span className="hidden sm:inline">· {formatDate(a.createdAt)}</span>
              </div>
            </article>
          ))
        )}
      </div>
    </DashboardShell>
  );
};

export default TenantAnnouncementsPage;
