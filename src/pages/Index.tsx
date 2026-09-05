import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Search, ShieldCheck, Users, Sparkles, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/SiteHeader";
import { PropertyCard } from "@/components/PropertyCard";
import { properties } from "@/data/properties";
import hero from "@/assets/hero-building.jpg";

const heroSrc = typeof hero === "string" ? hero : hero.src;

const Index = () => {
  const featured = properties.filter((p) => p.status === "available").slice(0, 3);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="container grid gap-12 py-12 md:grid-cols-12 md:gap-8 md:py-24">
          <div className="md:col-span-6 lg:col-span-7 flex flex-col justify-center">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-soft"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              A new way to live, rent and manage
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight text-balance md:text-7xl lg:text-[5.5rem]"
            >
              Find a home that{" "}
              <span className="relative inline-block">
                <span className="bg-gradient-to-br from-primary to-primary-glow bg-clip-text text-transparent italic">
                  feels right
                </span>
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="mt-6 max-w-xl text-lg text-muted-foreground text-balance"
            >
              Keja brings tenants, caretakers, and owners together on one calm,
              modern platform. Discover rooms, apartments and entire buildings —
              and manage them with ease.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3 }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <Button asChild size="lg" className="rounded-full px-6">
                <Link to="/properties">
                  Find a Home <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-full px-6">
                <Link to="/dashboard/owner">For Owners</Link>
              </Button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="mt-12 grid grid-cols-3 gap-6 border-t border-border pt-8"
            >
              {[
                { k: "1.2k+", v: "Listings" },
                { k: "98%", v: "Happy tenants" },
                { k: "24/7", v: "Care support" },
              ].map((s) => (
                <div key={s.v}>
                  <div className="font-display text-2xl font-semibold tracking-tight">{s.k}</div>
                  <div className="text-xs text-muted-foreground">{s.v}</div>
                </div>
              ))}
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="md:col-span-6 lg:col-span-5 relative"
          >
            <div className="relative aspect-[4/5] overflow-hidden rounded-3xl shadow-elevated">
              <img
                src={heroSrc}
                alt="Modern terracotta apartment building at golden hour"
                width={1600}
                height={1200}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-foreground/60 to-transparent" />
              <div className="absolute bottom-5 left-5 right-5 rounded-2xl bg-background/95 p-4 shadow-elevated backdrop-blur">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-warm text-primary-foreground">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground">Featured</div>
                    <div className="font-medium">Terracotta Loft, Westlands</div>
                  </div>
                  <Link
                    to="/properties/p2"
                    className="rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background"
                  >
                    View
                  </Link>
                </div>
              </div>
            </div>
            <div className="absolute -left-6 -top-6 hidden h-24 w-24 rounded-full gradient-warm blur-2xl opacity-60 md:block" />
          </motion.div>
        </div>
      </section>

      {/* Featured */}
      <section className="border-t border-border">
        <div className="container py-20">
          <div className="mb-10 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-widest text-primary">Featured</p>
              <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight md:text-5xl">
                Homes worth a closer look
              </h2>
            </div>
            <Link to="/properties" className="hidden items-center gap-1 text-sm font-medium text-foreground hover:text-primary md:inline-flex">
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {featured.map((p, i) => <PropertyCard key={p.id} property={p} index={i} />)}
          </div>
        </div>
      </section>

      {/* Roles */}
      <section className="bg-secondary text-secondary-foreground">
        <div className="container py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium uppercase tracking-widest text-primary-glow">Built for everyone</p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight md:text-5xl text-balance">
              One platform. Three roles. Zero friction.
            </h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { icon: Search, role: "Tenant", desc: "Discover, apply and track your home in one place.", to: "/dashboard/tenant" },
              { icon: Users, role: "Caretaker", desc: "Approve requests and keep units moving smoothly.", to: "/dashboard/caretaker" },
              { icon: ShieldCheck, role: "Owner", desc: "Full hierarchy control, analytics and assignment.", to: "/dashboard/owner" },
            ].map((c, i) => (
              <motion.div
                key={c.role}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.6 }}
                className="group rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur transition-all hover:bg-white/10"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl gradient-warm">
                  <c.icon className="h-5 w-5 text-primary-foreground" />
                </div>
                <h3 className="font-display text-2xl font-semibold tracking-tight">{c.role}</h3>
                <p className="mt-2 text-sm text-secondary-foreground/70">{c.desc}</p>
                <Link to={c.to} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary-glow hover:underline">
                  Open dashboard <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="container flex flex-col items-center justify-between gap-4 py-8 text-sm text-muted-foreground md:flex-row">
          <p>© {new Date().getFullYear()} Keja. Crafted with care.</p>
          <p>Where home begins.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
