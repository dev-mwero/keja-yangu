"use client";

import { ArrowLeft, Inbox, Search, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type ChatMessage, type ContactThread, contactThreadsStore } from "@/data/dashboard";
import { useCaretakerNav } from "@/hooks/use-caretaker-nav";
import { useLocalStore } from "@/hooks/use-local-store";
import { formatKES, relativeTime } from "@/lib/format";

const initial = (name: string) => name.slice(0, 1).toUpperCase();

const CaretakerCommunicationsPage = () => {
  const nav = useCaretakerNav();
  const { items, updateItem } = useLocalStore<ContactThread>(contactThreadsStore);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (t) => t.tenant.toLowerCase().includes(q) || t.property.toLowerCase().includes(q),
    );
  }, [items, query]);

  const selected = items.find((t) => t.id === selectedId) ?? null;

  const openThread = (id: string) => {
    setSelectedId(id);
    if (items.find((t) => t.id === id)?.unread) {
      updateItem(id, { unread: 0 });
    }
  };

  const reply = () => {
    if (!selected || !draft.trim()) return;
    const message: ChatMessage = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sender: "me",
      text: draft.trim(),
      at: new Date().toISOString(),
    };
    updateItem(selected.id, (thread) => ({
      ...thread,
      lastAt: message.at,
      messages: [...thread.messages, message],
    }));
    setDraft("");
  };

  const unreadTotal = items.reduce((sum, t) => sum + t.unread, 0);

  return (
    <DashboardShell
      roleName="Caretaker"
      nav={nav}
      title="Communications"
      subtitle={
        unreadTotal > 0
          ? `${unreadTotal} unread from your tenants`
          : "Messages from the tenants you manage."
      }
    >
      <div className="grid overflow-hidden rounded-2xl border border-border bg-card shadow-soft md:grid-cols-[320px_1fr]">
        <div className={`border-r border-border ${selected ? "hidden md:block" : "block"}`}>
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tenants…"
                className="pl-9"
              />
            </div>
          </div>
          <div className="max-h-[30rem] overflow-y-auto">
            {filtered.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">No conversations found.</p>
            )}
            {filtered.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className={`flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                  thread.id === selectedId ? "bg-muted/50" : ""
                }`}
                onClick={() => openThread(thread.id)}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                  {initial(thread.tenant)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{thread.tenant}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {relativeTime(thread.lastAt)}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {thread.property}
                    {thread.messages[thread.messages.length - 1]
                      ? ` · ${thread.messages[thread.messages.length - 1].text}`
                      : ""}
                  </p>
                </div>
                {thread.unread > 0 && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                    {thread.unread}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className={`flex flex-col ${selected ? "block" : "hidden md:flex"}`}>
          {selected ? (
            <>
              <div className="flex items-center gap-3 border-b border-border p-4">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={() => setSelectedId(null)}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                  {initial(selected.tenant)}
                </div>
                <div>
                  <p className="text-sm font-semibold">{selected.tenant}</p>
                  <p className="text-xs text-muted-foreground">
                    {selected.tenantEmail} · {selected.property}
                  </p>
                </div>
              </div>
              <div className="flex max-h-[26rem] flex-1 flex-col gap-3 overflow-y-auto p-4">
                {selected.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                      message.sender === "me"
                        ? "self-end bg-primary text-primary-foreground"
                        : "self-start bg-muted text-foreground"
                    }`}
                  >
                    <p>{message.text}</p>
                    <p
                      className={`mt-1 text-[10px] ${
                        message.sender === "me"
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground"
                      }`}
                    >
                      {relativeTime(message.at)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 border-t border-border p-3">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && reply()}
                  placeholder={`Reply to ${selected.tenant}…`}
                />
                <Button
                  size="icon"
                  className="shrink-0 rounded-full"
                  disabled={!draft.trim()}
                  onClick={reply}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
              <Inbox className="h-10 w-10 text-muted-foreground" />
              <h3 className="mt-3 font-display text-xl">Select a conversation</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {unreadTotal > 0
                  ? `You have ${unreadTotal} unread message${unreadTotal === 1 ? "" : "s"}.`
                  : "You're all caught up."}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-dashed border-border bg-card/50 p-4 text-center text-sm text-muted-foreground">
        Rent questions? Point tenants to Accounting. Typical rents run {formatKES(18000)}–
        {formatKES(220000)} per month.
      </div>
    </DashboardShell>
  );
};

export default CaretakerCommunicationsPage;
