import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Msg { id: string; from: "me" | "them"; text: string; time: string }

const seed: Msg[] = [
  { id: "m1", from: "them", text: "Hi Amina, just confirming the plumber comes Tuesday 10am.", time: "09:12" },
  { id: "m2", from: "me", text: "Perfect, I'll be home. Thank you!", time: "09:14" },
  { id: "m3", from: "them", text: "Great. He'll call when downstairs.", time: "09:15" },
];

export const ChatSection = () => {
  const [msgs, setMsgs] = useState<Msg[]>(seed);
  const [text, setText] = useState("");

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setMsgs((prev) => [
      ...prev,
      { id: `m${Date.now()}`, from: "me", text, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
    ]);
    setText("");
  };

  return (
    <div className="flex h-[60vh] flex-col overflow-hidden rounded-xl border border-border">
      <div className="border-b border-border bg-muted/40 px-4 py-3">
        <p className="font-medium">Caretaker · Building 12</p>
        <p className="text-xs text-muted-foreground">Typically replies within an hour</p>
      </div>
      <ul className="flex-1 space-y-2 overflow-y-auto p-4">
        {msgs.map((m) => (
          <li key={m.id} className={cn("flex", m.from === "me" ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
              m.from === "me" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
            )}>
              <p>{m.text}</p>
              <p className={cn("mt-0.5 text-[10px]", m.from === "me" ? "text-primary-foreground/70" : "text-muted-foreground")}>{m.time}</p>
            </div>
          </li>
        ))}
      </ul>
      <form onSubmit={send} className="flex items-center gap-2 border-t border-border p-3">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…" />
        <Button type="submit" size="icon" aria-label="Send"><Send className="h-4 w-4" /></Button>
      </form>
    </div>
  );
};