import Link from "next/link";

import { PropertyCard } from "@/components/PropertyCard";
import { Button } from "@/components/ui/button";
import { properties } from "@/data/properties";

export const PropertyShowcase = () => {
  const featured = properties.filter((p) => p.status === "available").slice(0, 3);

  return (
    <section className="border-t border-border">
      <div className="container py-20">
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-widest text-primary">Featured</p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight md:text-5xl">
              Homes worth a closer look
            </h2>
          </div>
          <Link
            href="/properties"
            className="hidden items-center gap-1 text-sm font-medium text-foreground hover:text-primary md:inline-flex"
          >
            View all <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {featured.map((p) => (
            <PropertyCard key={p.id} property={p} />
          ))}
        </div>
        <div className="mt-10 text-center md:hidden">
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/properties">View all properties</Link>
          </Button>
        </div>
      </div>
    </section>
  );
};
