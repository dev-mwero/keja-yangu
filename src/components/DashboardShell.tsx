import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export interface DashNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

interface Props {
  role: string;
  nav: DashNavItem[];
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export const DashboardShell = ({ role, nav, title, subtitle, children }: Props) => {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen bg-background">
      <div className="container flex gap-8 py-6">
        <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] w-60 shrink-0 flex-col rounded-2xl border border-border bg-card p-4 shadow-soft lg:flex">
          <Logo className="mb-6 px-2" />
          <div className="mb-4 px-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {role}
          </div>
          <nav className="flex flex-col gap-1">
            {nav.map((item) => {
              const active = pathname === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                    active
                      ? "bg-primary text-primary-foreground shadow-soft"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
            <p className="mb-2 font-medium text-foreground">Need help?</p>
            <p>Reach our support team — typically reply in under an hour.</p>
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
              {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
            </div>
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Back home</Link>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
};