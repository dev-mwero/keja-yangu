import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";
import { LogOut, LucideIcon, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";

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
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = () => {
    signOut();
    navigate("/", { replace: true });
  };

  const navList = (onNavigate?: () => void) => (
    <nav className="flex flex-col gap-1">
      {nav.map((item) => {
        const active = pathname === item.to;
        const Icon = item.icon;
        return (
          <Link
            key={`${item.to}-${item.label}`}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
              active
                ? "bg-primary text-primary-foreground shadow-soft"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="container flex gap-8 py-6">
        <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] w-60 shrink-0 flex-col rounded-2xl border border-border bg-card p-4 shadow-soft lg:flex">
          <Logo className="mb-6 px-2" />
          <div className="mb-4 px-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {role}
          </div>
          {navList()}
          <div className="mt-auto rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
            <p className="mb-2 font-medium text-foreground">Need help?</p>
            <p>Reach our support team — typically reply in under an hour.</p>
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="mt-1 lg:hidden" aria-label="Open menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[80%] max-w-xs p-0">
                  <SheetHeader className="border-b border-border p-5 text-left">
                    <SheetTitle asChild>
                      <Logo />
                    </SheetTitle>
                  </SheetHeader>
                  <div className="px-3 py-4">
                    <div className="mb-3 px-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                      {role}
                    </div>
                    {navList(() => setMobileOpen(false))}
                  </div>
                </SheetContent>
              </Sheet>
              <div>
                <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
                {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ThemeToggle />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="hidden sm:inline-flex"
              >
                <LogOut className="mr-1.5 h-4 w-4" /> Sign out
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSignOut}
                className="sm:hidden"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
};