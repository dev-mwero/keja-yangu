import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";

export const Hero = () => {
  return (
    <section className="relative overflow-hidden">
      <div className="container grid gap-12 py-12 md:grid-cols-12 md:gap-8 md:py-24">
        <div className="flex flex-col justify-center md:col-span-6 lg:col-span-7">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />A new way to live, rent and
            manage
          </div>

          <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight text-balance md:text-7xl lg:text-[5.5rem]">
            Find a home that{" "}
            <span className="relative inline-block">
              <span className="bg-gradient-to-br from-primary to-primary-glow bg-clip-text text-transparent italic">
                feels right
              </span>
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-lg text-muted-foreground text-balance">
            {BRAND.name} brings tenants, caretakers, and owners together on one calm, modern
            platform. Discover rooms, apartments and entire buildings — and manage them with ease.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="rounded-full px-6">
              <Link href="/properties">
                Find a Home <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-full px-6">
              <Link href="/dashboard/admin">For Owners</Link>
            </Button>
          </div>
        </div>

        <div className="relative md:col-span-6 lg:col-span-5">
          <div className="relative aspect-[4/5] overflow-hidden rounded-3xl shadow-elevated">
            <Image
              src="/images/hero-building.jpg"
              alt="Modern terracotta apartment building at golden hour"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 42vw"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-foreground/60 to-transparent" />
            <div className="absolute bottom-5 left-5 right-5 rounded-2xl bg-background/95 p-4 shadow-elevated backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-warm text-primary-foreground">
                  <span className="font-display text-lg font-bold">C</span>
                </div>
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground">Featured</div>
                  <div className="font-medium">Terracotta Loft, Westlands</div>
                </div>
                <Link
                  href="/properties/p2"
                  className="rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background"
                >
                  View
                </Link>
              </div>
            </div>
          </div>
          <div
            aria-hidden="true"
            className="absolute -left-6 -top-6 hidden h-24 w-24 rounded-full gradient-warm blur-2xl opacity-60 md:block motion-reduce:opacity-40"
          />
        </div>
      </div>
    </section>
  );
};
