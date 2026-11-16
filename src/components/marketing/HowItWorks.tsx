import { CheckCircle2, Home, Search } from "lucide-react";

const steps = [
  {
    n: "01",
    icon: Search,
    title: "Discover",
    desc: "Browse verified listings filtered by type, location and price.",
  },
  {
    n: "02",
    icon: Home,
    title: "Apply",
    desc: "Submit an application and track its status in real time.",
  },
  {
    n: "03",
    icon: CheckCircle2,
    title: "Manage",
    desc: "Sign your lease, pay invoices and raise requests from one dashboard.",
  },
];

export const HowItWorks = () => {
  return (
    <section className="border-t border-border">
      <div className="container py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">How it works</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-balance md:text-5xl">
            From search to signed lease in three steps.
          </h2>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div
              key={s.n}
              className="relative rounded-2xl border border-border bg-card p-6 shadow-soft"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="font-display text-3xl font-semibold text-primary/30">{s.n}</span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <s.icon className="h-5 w-5" />
                </div>
              </div>
              <h3 className="font-display text-xl font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
