import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";

export const FinalCta = () => {
  return (
    <section className="border-t border-border bg-secondary text-secondary-foreground">
      <div className="container py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-balance md:text-5xl">
            Ready to find your next home?
          </h2>
          <p className="mt-4 text-secondary-foreground/70">
            Join tenants, caretakers and owners already using {BRAND.name}.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="rounded-full px-6">
              <Link href="/properties">
                Find a Home <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-full px-6">
              <Link href="/auth">Create an account</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};
