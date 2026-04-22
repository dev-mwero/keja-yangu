import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
}

export const MobileNav = ({ links }: { links: NavItem[] }) => {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[88%] max-w-sm p-0">
        <SheetHeader className="border-b border-border p-6 text-left">
          <SheetTitle asChild>
            <Logo />
          </SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 p-4">
          {links.map((l) => {
            const active = pathname === l.to;
            return (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "rounded-xl px-4 py-3 text-base font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-4 border-t border-border p-4">
          <Button asChild className="w-full rounded-full" onClick={() => setOpen(false)}>
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};