import { useEffect, useRef, useState } from "react";
import { Send, Paperclip, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

interface Attachment {
  name: string;
  size: number;
  mimeType: string;
  dataUrl: string;
}

interface Msg {
  id: string;
  from: "me" | "them";
  text: string;
  time: string;
  attachment?: Attachment;
}

const seed: Msg[] = [
  { id: "m1", from: "them", text: "Hi! Just confirming the plumber comes Tuesday 10am.", time: "09:12" },
  { id: "m2", from: "me", text: "Perfect, I'll be home. Thank you!", time: "09:14" },
  { id: "m3", from: "them", text: "Great. He'll call when downstairs.", time: "09:15" },
];

const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024; // 2MB cap (localStorage friendly)
const storageKey = (email?: string) => `keja-chat-${(email ?? "guest").toLowerCase()}`;

const formatBytes = (b: number) =>
  b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(2)} MB`;

export const ChatSection = () => {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLUListElement>(null);
  const [msgs, setMsgs] = useState<Msg[]>(seed);
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);

  // Hydrate from localStorage per-user
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey(user?.email));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) setMsgs(parsed as Msg[]);
      }
    } catch {
      /* ignore */
    }
  }, [user?.email]);

  // Persist + autoscroll
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey(user?.email), JSON.stringify(msgs));
    } catch {
      /* quota — silently ignore */
    }
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, user?.email]);

  const pickFile = () => fileRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      alert(`Attachments must be under ${formatBytes(MAX_ATTACHMENT_BYTES)}.`);
      return;
    }
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onerror = () => reject(new Error("read failed"));
      r.onload = () => resolve(String(r.result ?? ""));
      r.readAsDataURL(file);
    });
    setAttachment({ name: file.name, size: file.size, mimeType: file.type || "application/octet-stream", dataUrl });
  };

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() && !attachment) return;
    const newMsg: Msg = {
      id: `m${Date.now()}`,
      from: "me",
      text: text.trim(),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      attachment: attachment ?? undefined,
    };
    setMsgs((prev) => [...prev, newMsg]);
    setText("");
    setAttachment(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(e as unknown as React.FormEvent);
    }
  };

  return (
    <div className="flex h-[65vh] flex-col overflow-hidden rounded-xl border border-border">
      <div className="border-b border-border bg-muted/40 px-4 py-3">
        <p className="font-medium">Caretaker · Building 12</p>
        <p className="text-xs text-muted-foreground">Typically replies within an hour</p>
      </div>

      <ul ref={scrollerRef} className="flex-1 space-y-2 overflow-y-auto p-4">
        {msgs.map((m) => (
          <li key={m.id} className={cn("flex", m.from === "me" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
                m.from === "me" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
              )}
            >
              {m.attachment && (
                <a
                  href={m.attachment.dataUrl}
                  download={m.attachment.name}
                  className={cn(
                    "mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs",
                    m.from === "me" ? "bg-primary-foreground/15" : "bg-background/60",
                  )}
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span className="truncate">{m.attachment.name}</span>
                  <span className="opacity-70">· {formatBytes(m.attachment.size)}</span>
                </a>
              )}
              {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
              <p
                className={cn(
                  "mt-0.5 text-[10px]",
                  m.from === "me" ? "text-primary-foreground/70" : "text-muted-foreground",
                )}
              >
                {m.time}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <form onSubmit={send} className="space-y-2 border-t border-border p-3">
        {attachment && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
            <span className="inline-flex items-center gap-2 truncate">
              <FileText className="h-3.5 w-3.5 text-primary" />
              <span className="truncate">{attachment.name}</span>
              <span className="text-muted-foreground">· {formatBytes(attachment.size)}</span>
            </span>
            <button
              type="button"
              onClick={() => setAttachment(null)}
              className="rounded-full p-1 hover:bg-background"
              aria-label="Remove attachment"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx"
            onChange={onFileChange}
          />
          <Button type="button" size="icon" variant="ghost" onClick={pickFile} aria-label="Attach file">
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Write a message…  (Enter to send, Shift+Enter for newline)"
            rows={1}
            className="max-h-32 min-h-10 resize-none"
          />
          <Button type="submit" size="icon" aria-label="Send" disabled={!text.trim() && !attachment}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
};