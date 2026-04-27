import { useState } from "react";
import { MessageCircle, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "chats" | "announcements";

const chats = [
  { id: "c1", name: "Amina K.", last: "Tap is fixed, thank you!", time: "2h" },
  { id: "c2", name: "Brian O.", last: "Can I extend payment to Friday?", time: "5h" },
  { id: "c3", name: "Building 12 group", last: "Water will be off 9–11am tomorrow.", time: "1d" },
];

const announcements = [
  { id: "a1", title: "Scheduled water maintenance", body: "Mains shut off 9–11am on April 30 for Building 12.", date: "Apr 28" },
  { id: "a2", title: "New rent payment options", body: "M-Pesa Paybill 4421888 now live across all units.", date: "Apr 22" },
];

export const CommunicationsSection = () => {
  const [tab, setTab] = useState<Tab>("chats");

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl border border-border bg-muted/40 p-1">
        <TabBtn active={tab === "chats"} onClick={() => setTab("chats")} icon={MessageCircle}>Chats</TabBtn>
        <TabBtn active={tab === "announcements"} onClick={() => setTab("announcements")} icon={Megaphone}>Announcements</TabBtn>
      </div>

      {tab === "chats" ? (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {chats.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-4 p-4 hover:bg-muted/40">
              <div className="min-w-0">
                <p className="font-medium">{c.name}</p>
                <p className="truncate text-sm text-muted-foreground">{c.last}</p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{c.time}</span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-3">
          {announcements.map((a) => (
            <li key={a.id} className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">{a.title}</p>
                <span className="text-xs text-muted-foreground">{a.date}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{a.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

import type { LucideIcon } from "lucide-react";
const TabBtn = ({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: LucideIcon; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
      active ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground",
    )}
  >
    <Icon className="h-4 w-4" />{children}
  </button>
);