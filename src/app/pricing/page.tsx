import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/MarketingShell";
import { Button } from "@/components/ui/button";
import { BRAND, BRAND_TITLE_TEMPLATE } from "@/lib/brand";

export const metadata: Metadata = {
  title: { default: "Pricing", template: BRAND_TITLE_TEMPLATE },
  description: `${BRAND.name} pricing — simple plans for tenants, caretakers and owners.`,
};

const plans = [
  {
    name: "Tenant",
    price: "Free",
    desc: "Everything a tenant needs to find and manage a home.",
    features: [
      "Browse listings",
      "Apply online",
      "Pay invoices",
      "Track requests",
      "Message caretakers",
    ],
    cta: { label: "Get started", href: "/auth" },
    highlight: false,
  },
  {
    name: "Caretaker",
    price: "Free",
    desc: "Tools to keep units moving and tenants happy.",
    features: [
      "Approve applications",
      "Manage units",
      "Raise invoices",
      "Handle complaints",
      "Chat with tenants",
    ],
    cta: { label: "Get started", href: "/auth" },
    highlight: true,
  },
  {
    name: "Owner",
    price: "Contact us",
    desc: "Full portfolio control and analytics for owners.",
    features: [
      "Multi-property hierarchy",
      "Analytics & reports",
      "Commission tracking",
      "Team & roles",
      "Priority support",
    ],
    cta: { label: "Talk to us", href: "/contact" },
    highlight: false,
  },
];

export default function PricingPage() {
  return (
    <MarketingShell>
      <section className="container py-16 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">Pricing</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight md:text-5xl">
            Simple, transparent pricing.
          </h1>
          <p className="mt-4 text-muted-foreground">
            Start free. Upgrade when you need portfolio-scale tools.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`flex flex-col rounded-2xl border p-6 shadow-soft ${
                p.highlight
                  ? "border-primary bg-card ring-2 ring-primary/20"
                  : "border-border bg-card"
              }`}
            >
              <h3 className="font-display text-2xl font-semibold tracking-tight">{p.name}</h3>
              <div className="mt-2 font-display text-4xl font-semibold tracking-tight">
                {p.price}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{p.desc}</p>
              <ul className="mt-6 flex-1 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <span className="text-primary">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Button
                asChild
                className="mt-6 w-full rounded-full"
                variant={p.highlight ? "default" : "outline"}
              >
                <Link href={p.cta.href}>{p.cta.label}</Link>
              </Button>
            </div>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}
