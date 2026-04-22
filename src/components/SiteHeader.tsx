import { Link, useLocation } from "react-router-dom";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { to: "/", label: "Home" },
  { to: "/properties", label: "Properties" },
  { to: "/dashboard/tenant", label: "Tenant" },
  { to: "/dashboard/caretaker", label: "Caretaker" },
  { to: "/dashboard/owner", label: "Owner" },
];

export const SiteHeader = () => {
  const { pathname } = useLocation();
  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                pathname === l.to && "bg-muted text-foreground"
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to="/dashboard/tenant">Sign in</Link>
          </Button>
          <Button asChild size="sm" className="rounded-full">
            <Link to="/properties">Find a Home</Link>
          </Button>
        </div>
      </div>
    </header>
  );
};