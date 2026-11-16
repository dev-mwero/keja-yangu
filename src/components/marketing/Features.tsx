import { ArrowRight, Search, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";

const roles = [
  {
    icon: Search,
    role: "Tenant",
    desc: "Discover, apply and track your home in one place.",
    href: "/dashboard/tenant",
  },
  {
    icon: Users,
    role: "Caretaker",
    desc: "Approve requests and keep units moving smoothly.",
    href: "/dashboard/caretaker",
  },
  {
    icon: ShieldCheck,
    role: "Owner",
    desc: "Full hierarchy control, analytics and assignment.",
    href: "/dashboard/admin",
  },
];

export const Features = () => {
  return (
    <section className="bg-secondary text-secondary-foreground">
      <div className="container py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-primary-glow">
            Built for everyone
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-balance md:text-5xl">
            One platform. Three roles. Zero friction.
          </h2>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {roles.map((c) => (
            <div
              key={c.role}
              className="group rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur transition-colors hover:bg-white/10"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl gradient-warm">
                <c.icon className="h-5 w-5 text-primary-foreground" />
              </div>
              <h3 className="font-display text-2xl font-semibold tracking-tight">{c.role}</h3>
              <p className="mt-2 text-sm text-secondary-foreground/70">{c.desc}</p>
              <Link
                href={c.href}
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary-glow hover:underline"
              >
                Open dashboard <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
