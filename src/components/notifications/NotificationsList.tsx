"use client";

import { BellOff, ChevronRight, Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useNotificationMutations } from "@/hooks/use-notifications";
import { useUnreadCount } from "@/hooks/use-unread-count";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/types/notifications";

const PAGE_LIMIT = 20;

type Tab = "all" | "unread";

const TYPE_LABELS: Record<AppNotification["type"], string> = {
  "invoice:paid": "Invoice paid",
  "invoice:overdue": "Invoice overdue",
  "lease:expiring": "Lease expiring",
  "complaint:created": "Complaint received",
  "complaint:status-changed": "Complaint updated",
  "chat:reply": "New message",
  announcement: "Announcement",
  "move-request:created": "Move request",
  "move-request:decided": "Move request decided",
};

type BadgePropsVariant = "default" | "destructive" | "secondary" | "outline";

const typeVariant = (type: AppNotification["type"]): BadgePropsVariant => {
  switch (type) {
    case "invoice:overdue":
    case "lease:expiring":
      return "destructive";
    case "complaint:created":
    case "complaint:status-changed":
      return "outline";
    case "chat:reply":
    case "announcement":
      return "secondary";
    default:
      return "default";
  }
};

export const NotificationsList = () => {
  const router = useRouter();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [pagination, setPagination] = useState<{
    page: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  }>({ page: 1, total: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const { markRead, markAllRead, pending } = useNotificationMutations();
  const { count } = useUnreadCount();

  const fetchPage = useCallback(
    async (page: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(PAGE_LIMIT),
        });
        if (tab === "unread") params.set("unread", "true");
        const res = await fetch(`/api/v1/notifications?${params}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load notifications");
        setNotifications(json.data);
        setPagination(
          json.pagination ?? {
            page,
            total: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPrevPage: false,
          },
        );
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      } finally {
        setLoading(false);
      }
    },
    [tab],
  );

  useEffect(() => {
    void fetchPage(1);
  }, [fetchPage]);

  const handleMarkRead = useCallback(
    async (id: string) => {
      try {
        await markRead(id);
        setNotifications((items) =>
          items.map((n) => (n._id === id ? { ...n, readAt: new Date().toISOString() } : n)),
        );
      } catch {
        // Best-effort; navigation still happens.
      }
    },
    [markRead],
  );

  const handleMarkAllRead = useCallback(async () => {
    try {
      await markAllRead();
      setNotifications((items) => items.map((n) => ({ ...n, readAt: new Date().toISOString() })));
      void fetchPage(1);
    } catch {
      // Best-effort.
    }
  }, [markAllRead, fetchPage]);

  const filtered = useMemo(
    () => (tab === "all" ? notifications : notifications.filter((n) => !n.readAt)),
    [notifications, tab],
  );

  const unreadTotal = notifications.filter((n) => !n.readAt).length;

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-soft">
        <Clock className="mx-auto h-10 w-10 text-muted-foreground" />
        <h2 className="mt-4 font-display text-lg font-semibold">Loading notifications…</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-soft">
        <BellOff className="mx-auto h-10 w-10 text-muted-foreground" />
        <h2 className="mt-4 font-display text-lg font-semibold">Couldn't load notifications</h2>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Button onClick={() => void fetchPage(1)}>Try again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">Notifications</h2>
          <p className="text-sm text-muted-foreground">
            {unreadTotal > 0 ? `${unreadTotal} unread` : "You're all caught up"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-x-1 text-sm">
            <span className="text-muted-foreground">Unread:</span>
            <span className="font-medium">{count}</span>
          </div>
          {notifications.length > 0 && (
            <Button variant="outline" size="sm" disabled={pending} onClick={handleMarkAllRead}>
              Mark all read
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-1">
        {[
          { value: "all", label: "All" },
          { value: "unread", label: "Unread" },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setTab(option.value as Tab)}
            className={`flex items-center gap-2 rounded-lg border-transparent px-3 py-1.5 text-sm font-medium transition-all ${
              tab === option.value
                ? "bg-primary text-primary-foreground shadow-soft"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Time</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="w-40">Body</TableHead>
              <TableHead className="w-16 text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  {tab === "unread" ? "No unread notifications." : "No notifications yet."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((notification) => {
                const isUnread = !notification.readAt;
                return (
                  <TableRow
                    key={notification._id}
                    className={cn(
                      isUnread ? "bg-muted/40" : "",
                      "group cursor-pointer hover:bg-muted/30",
                    )}
                    onClick={() => {
                      void handleMarkRead(notification._id);
                      if (notification.link) void router.push(notification.link);
                    }}
                  >
                    <TableCell className="font-medium text-muted-foreground">
                      {relativeTime(notification.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={typeVariant(notification.type)} className="capitalize">
                        {TYPE_LABELS[notification.type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium truncate" title={notification.title}>
                      {notification.title}
                    </TableCell>
                    <TableCell
                      className="text-sm text-muted-foreground truncate"
                      title={notification.body}
                    >
                      {notification.body}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          "inline-flex h-2 w-2 shrink-0 rounded-full",
                          isUnread ? "bg-primary" : "bg-muted-foreground/30",
                        )}
                        aria-hidden="true"
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={!pagination.hasPrevPage || pending}
              onClick={() => void fetchPage(pagination.page - 1)}
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!pagination.hasNextPage || pending}
              onClick={() => void fetchPage(pagination.page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
