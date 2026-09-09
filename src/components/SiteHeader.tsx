"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";
import { MobileNav } from "./MobileNav";
import { useAuth } from "@/hooks/use-auth";

const publicLinks = [
  { href: "/", label: "Home" },
  { href: "/properties", label: "Properties" },
];

const dashboardLinks: Record<string, { href: string; label: string }> = {
  tenant: { href: "/dashboard/tenant", label: "Dashboard" },
  caretaker: { href: "/dashboard/caretaker", label: "Dashboard" },
  owner: { href: "/dashboard/owner", label: "Dashboard" },
};

export const SiteHeader = () => {
  const pathname = usePathname();
  const { user } = useAuth();

  const links = [
    ...publicLinks,
    ...(user?.role ? [dashboardLinks[user.role]] : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                pathname === l.href && "bg-muted text-foreground"
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle className="hidden sm:inline-flex" />
          {user ? (
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href={dashboardLinks[user.role]?.href ?? "/dashboard/tenant"}>Dashboard</Link>
            </Button>
          ) : (
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/auth">Sign in</Link>
            </Button>
          )}
          <Button asChild size="sm" className="hidden rounded-full sm:inline-flex">
            <Link href="/properties">Find a Home</Link>
          </Button>
          <MobileNav links={links} />
        </div>
      </div>
    </header>
  );
};
