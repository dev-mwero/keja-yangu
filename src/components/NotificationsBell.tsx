"use client";

import { Bell, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useNotificationMutations, useNotifications } from "@/hooks/use-notifications";
import { useUnreadCount } from "@/hooks/use-unread-count";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/types/notifications";

export const NotificationsBell = () => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { count } = useUnreadCount();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Button>
      {open && <NotificationPanel onClose={() => setOpen(false)} />}
    </div>
  );
};

function NotificationPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { notifications, loading, error, refetch } = useNotifications({ unread: true });
  const { markRead, markAllRead, pending } = useNotificationMutations();

  const openNotification = async (notification: AppNotification) => {
    if (!notification.readAt) {
      try {
        await markRead(notification._id);
      } catch {
        // Best-effort: still navigate even if marking read fails.
      }
    }
    onClose();
    if (notification.link) router.push(notification.link);
  };

  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-border bg-card p-2 shadow-soft">
      <div className="flex items-center justify-between px-2 py-1">
        <p className="text-sm font-semibold">Notifications</p>
        {notifications.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs"
            disabled={pending}
            onClick={() => {
              void markAllRead().then(refetch);
            }}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </Button>
        )}
      </div>
      <div className="max-h-80 overflow-y-auto">
        {loading ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">{error}</p>
        ) : notifications.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            You&apos;re all caught up
          </p>
        ) : (
          notifications.map((notification) => (
            <button
              key={notification._id}
              type="button"
              onClick={() => void openNotification(notification)}
              className="flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left hover:bg-muted"
            >
              <span
                className={cn(
                  "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                  notification.readAt ? "bg-muted-foreground/30" : "bg-primary",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{notification.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {notification.body}
                </span>
                <span className="block text-xs text-muted-foreground/70">
                  {relativeTime(notification.createdAt)}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
