"use client";

import { Mail, MailOpen } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ContactMessage {
  _id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: "new" | "read";
  createdAt: string;
}

export const ContactMessagesList = () => {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "new" | "read">("all");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = filter !== "all" ? `?status=${filter}` : "";
      const res = await fetch(`/api/v1/contact${params}`);
      if (!res.ok) throw new Error("Failed to load messages");
      const data = await res.json();
      setMessages(data.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (id: string) => {
    const res = await fetch(`/api/v1/contact/${id}`, { method: "PATCH" });
    if (res.ok) {
      setMessages((prev) => prev.map((m) => (m._id === id ? { ...m, status: "read" } : m)));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(["all", "new", "read"] as const).map((t) => (
          <Button
            key={t}
            size="sm"
            variant={filter === t ? "default" : "outline"}
            className="rounded-full capitalize"
            onClick={() => setFilter(t)}
          >
            {t}
          </Button>
        ))}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : messages.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center text-muted-foreground">
          <Mail className="mx-auto mb-3 h-8 w-8 opacity-60" />
          No messages yet.
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>From</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Received</TableHead>
                <TableHead className="w-24">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {messages.map((m) => (
                <TableRow key={m._id} className={cn(m.status === "new" && "bg-primary/5")}>
                  <TableCell className="align-top">
                    <div className="font-medium">{m.name}</div>
                    <a
                      href={`mailto:${m.email}`}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      {m.email}
                    </a>
                  </TableCell>
                  <TableCell className="align-top font-medium">{m.subject}</TableCell>
                  <TableCell className="align-top max-w-md whitespace-pre-wrap text-sm text-muted-foreground">
                    {m.message}
                  </TableCell>
                  <TableCell className="align-top text-xs text-muted-foreground">
                    {relativeTime(new Date(m.createdAt))}
                  </TableCell>
                  <TableCell className="align-top">
                    {m.status === "new" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => void markRead(m._id)}
                      >
                        <MailOpen className="mr-1 h-3.5 w-3.5" /> Mark read
                      </Button>
                    ) : (
                      <Badge variant="secondary">Read</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
