import { Megaphone } from "lucide-react";

const announcements = [
  { id: "a1", title: "Scheduled water maintenance", body: "Mains shut off 9–11am on April 30 for Building 12.", date: "Apr 28" },
  { id: "a2", title: "New rent payment options", body: "M-Pesa Paybill 4421888 now live across all units.", date: "Apr 22" },
  { id: "a3", title: "Community clean-up day", body: "Join us Saturday 10am at the courtyard. Refreshments provided.", date: "Apr 18" },
];

export const AnnouncementsSection = () => (
  <ul className="space-y-3">
    {announcements.map((a) => (
      <li key={a.id} className="rounded-xl border border-border bg-muted/40 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" />
            <p className="font-medium">{a.title}</p>
          </div>
          <span className="text-xs text-muted-foreground">{a.date}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{a.body}</p>
      </li>
    ))}
  </ul>
);