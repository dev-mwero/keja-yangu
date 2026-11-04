"use client";

import { ArrowLeft, Mail, MessagesSquare, Plus, Send } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { SearchInput } from "@/components/SearchInput";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  useChatContacts,
  useChatMutations,
  useChatThreads,
  useThreadMessages,
} from "@/hooks/use-chat";
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

export interface ChatInboxProps {
  /** Show the "New conversation" picker (tenants only — staff reply to inbound threads). */
  canStartConversation?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
  searchPlaceholder?: string;
  /** Note rendered above the search row; used by the tenant panel. */
  footerNote?: ReactNode;
}

/**
 * Shared chat body for the tenant Messages page and the staff Communications
 * inbox. Tenants get a "New conversation" picker over `/api/v1/chat/contacts`;
 * staff see the tenant as the contact (the route serializes per viewer role).
 */
export function ChatInbox({
  canStartConversation = false,
  emptyTitle = "Select a conversation",
  emptyHint = "Messages with your property team appear here.",
  searchPlaceholder = "Search conversations…",
  footerNote,
}: ChatInboxProps) {
  const { items, markThreadRead, bumpThread, refetch } = useChatThreads();
  const [query, setQuery] = useState("");
  const visibleItems = items.filter((t) => matchesQuery(query, t.contact, t.lastMessageText));
  const { sendMessage, openThread, startThread } = useChatMutations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const { messages, appendMessage } = useThreadMessages(selectedId);
  const [pickerOpen, setPickerOpen] = useState(false);

  const selected = items.find((t) => t._id === selectedId) ?? null;
  const totalThreads = items.length;
  const unreadThreads = items.filter((t) => t.unread > 0).length;

  const openThreadAndMarkRead = (id: string) => {
    setSelectedId(id);
    if (items.find((t) => t._id === id)?.unread) {
      markThreadRead(id);
    }
    void openThread(id);
  };

  const send = async () => {
    if (!selected || !draft.trim()) return;
    const text = draft.trim();
    try {
      const message = await sendMessage(selected._id, text);
      appendMessage(message);
      bumpThread(selected._id, { lastAt: message.at, lastMessageText: message.text });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setDraft("");
    }
  };

  const beginConversation = async (contact: {
    userId: string;
    role: "owner" | "caretaker";
    propertyId: string;
  }) => {
    try {
      const thread = await startThread(contact.userId, contact.role, contact.propertyId);
      refetch();
      setSelectedId(thread._id);
      setPickerOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start conversation");
    }
  };

  return (
    <>
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <StatCard
          label="Conversations"
          value={totalThreads}
          icon={MessagesSquare}
          hint="Active message threads"
        />
        <StatCard
          label="Unread threads"
          value={unreadThreads}
          icon={Mail}
          hint="Waiting for your reply"
        />
      </div>

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
                  aria-label="Send message"
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
              <h3 className="mt-3 font-display text-xl">{emptyTitle}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{emptyHint}</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-dashed border-border p-4 text-center">
        {footerNote && <p className="text-xs text-muted-foreground">{footerNote}</p>}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={searchPlaceholder}
            className="w-full sm:w-56"
          />
          {canStartConversation && (
            <Button variant="outline" className="rounded-full" onClick={() => setPickerOpen(true)}>
              <Plus className="h-4 w-4" />
              New conversation
            </Button>
          )}
        </div>
      </div>

      {canStartConversation && (
        <NewConversationDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onSelect={(contact) => void beginConversation(contact)}
        />
      )}
    </>
  );
}

function NewConversationDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (contact: { userId: string; role: "owner" | "caretaker"; propertyId: string }) => void;
}) {
  const { items, loading } = useChatContacts(open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New conversation</DialogTitle>
          <DialogDescription>Choose who you want to message.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading contacts…</p>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No contacts yet — your landlord and caretaker will appear here once you're linked to a
            property.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((contact) => (
              <button
                key={`${contact.userId}-${contact.propertyId}`}
                type="button"
                className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted/50"
                onClick={() =>
                  onSelect({
                    userId: contact.userId,
                    role: contact.role,
                    propertyId: contact.propertyId,
                  })
                }
              >
                <ContactAvatar name={contact.name} className="h-10 w-10" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{contact.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {contact.role === "owner" ? "Landlord" : "Caretaker"} · {contact.property}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
