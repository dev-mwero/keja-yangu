"use client";

import { ArrowLeft, MessagesSquare, Plus, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { SearchInput } from "@/components/SearchInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChatMutations, useChatThreads, useThreadMessages } from "@/hooks/use-chat";
import { relativeTime } from "@/lib/format";
import { matchesQuery } from "@/lib/search";

const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const ContactAvatar = ({ name, className = "" }: { name: string; className?: string }) => (
  <div
    className={`flex items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary ${className}`}
  >
    {initials(name)}
  </div>
);

/** Tenant chat body — rendered inside the Messages tabs. */
export function TenantChatPanel() {
  const { items, markThreadRead, bumpThread } = useChatThreads();
  const [query, setQuery] = useState("");
  const visibleItems = items.filter((t) => matchesQuery(query, t.contact, t.lastMessageText));
  const { sendMessage, openThread } = useChatMutations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const { messages, appendMessage } = useThreadMessages(selectedId);

  const selected = items.find((t) => t._id === selectedId) ?? null;

  const openThreadAndMarkRead = (id: string) => {
    setSelectedId(id);
    if (items.find((t) => t._id === id)?.unread) {
      markThreadRead(id);
    }
    void openThread(id);
  };

  const send = async () => {
    if (!selected || !draft.trim()) return;
    try {
      const message = await sendMessage(selected._id, draft.trim());
      appendMessage(message);
      bumpThread(selected._id, { lastAt: message.at, lastMessageText: message.text });
    } finally {
      setDraft("");
    }
  };

  return (
    <>
      <div className="grid overflow-hidden rounded-2xl border border-border bg-card shadow-soft md:grid-cols-[320px_1fr]">
        <div className={`border-r border-border ${selected ? "hidden md:block" : "block"}`}>
          <div className="border-b border-border p-4">
            <h3 className="font-display text-lg font-semibold">Conversations</h3>
          </div>
          <div className="max-h-[32rem] overflow-y-auto">
            {visibleItems.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                No conversations match your search.
              </p>
            )}
            {visibleItems.map((thread) => (
              <button
                key={thread._id}
                type="button"
                className={`flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                  thread._id === selectedId ? "bg-muted/50" : ""
                }`}
                onClick={() => openThreadAndMarkRead(thread._id)}
              >
                <ContactAvatar name={thread.contact} className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="truncate text-sm font-medium">{thread.contact}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {relativeTime(thread.lastAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-muted-foreground">
                      {thread.lastMessageText}
                    </p>
                    {thread.unread > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                        {thread.unread}
                      </span>
                    )}
                  </div>
                </div>
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
                <ContactAvatar name={selected.contact} className="h-9 w-9" />
                <div>
                  <p className="text-sm font-semibold">{selected.contact}</p>
                  <p className="text-xs text-muted-foreground">
                    {selected.role} · {selected.property}
                  </p>
                </div>
              </div>
              <div className="flex max-h-[24rem] flex-1 flex-col gap-3 overflow-y-auto p-4">
                {messages.map((message) => (
                  <div
                    key={message._id}
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
                  onKeyDown={(e) => e.key === "Enter" && void send()}
                  placeholder={`Message ${selected.contact}…`}
                />
                <Button
                  size="icon"
                  className="shrink-0 rounded-full"
                  disabled={!draft.trim()}
                  onClick={() => void send()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
              <MessagesSquare className="h-10 w-10 text-muted-foreground" />
              <h3 className="mt-3 font-display text-xl">Select a conversation</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Messages with your caretaker and landlord appear here.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-dashed border-border p-4 text-center">
        <p className="text-xs text-muted-foreground">
          Need urgent help? Call your caretaker directly or report an issue from{" "}
          <Link href="/dashboard/tenant/home" className="text-primary hover:underline">
            My Home
          </Link>
          .
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search conversations…"
            className="w-full sm:w-56"
          />
          <Button variant="outline" className="rounded-full" onClick={() => void send()}>
            <Plus className="h-4 w-4" />
            New conversation
          </Button>
        </div>
      </div>
    </>
  );
}
