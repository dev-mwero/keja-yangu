import Link from "next/link";

import { MarketingShell } from "@/components/MarketingShell";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";

export default function NotFound() {
  return (
    <MarketingShell>
      <section className="container flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
        <p className="font-display text-7xl font-semibold tracking-tight text-primary/30">404</p>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
          Page not found
        </h1>
        <p className="mt-3 max-w-md text-muted-foreground">
          The page you're looking for doesn't exist or has been moved. Let's get you back home.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild className="rounded-full px-6">
            <Link href="/">Return home</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-full px-6">
            <Link href="/properties">Browse homes</Link>
          </Button>
          <Button asChild variant="ghost" className="rounded-full px-6">
            <Link href="/contact">Contact support</Link>
          </Button>
        </div>
        <p className="mt-10 text-sm text-muted-foreground">
          {BRAND.name} — {BRAND.tagline}
        </p>
      </section>
    </MarketingShell>
  );
}
