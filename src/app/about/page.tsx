import type { Metadata } from "next";

import { MarketingShell } from "@/components/MarketingShell";
import { BRAND, BRAND_TITLE_TEMPLATE } from "@/lib/brand";

export const metadata: Metadata = {
  title: { default: "About", template: BRAND_TITLE_TEMPLATE },
  description: `${BRAND.name} — property rentals and tenant management for Kenya.`,
};

const values = [
  {
    title: "Calm by design",
    body: "A platform that stays out of the way so tenants, caretakers and owners can focus on living and managing.",
  },
  {
    title: "Transparent",
    body: "Clear pricing, clear status, clear audit trails. No hidden fees, no surprises.",
  },
  {
    title: "Built for Kenya",
    body: "M-Pesa payments, local property types, and support that understands the market.",
  },
];

export default function AboutPage() {
  return (
    <MarketingShell>
      <section className="container py-16 md:py-24">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">About</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight md:text-5xl">
            A calmer way to rent and manage homes.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            {BRAND.name} brings tenants, caretakers and property owners together on one modern
            platform. We believe renting should be simple, transparent and dignified for everyone
            involved — from the first search to the final receipt.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-5xl gap-6 md:grid-cols-3">
          {values.map((v) => (
            <div key={v.title} className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <h3 className="font-display text-xl font-semibold tracking-tight">{v.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{v.body}</p>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-16 max-w-3xl">
          <h2 className="font-display text-2xl font-semibold tracking-tight">What we do</h2>
          <ul className="mt-4 space-y-3 text-muted-foreground">
            <li>• List and discover verified homes, apartments and units.</li>
            <li>• Manage leases, invoices, payments and maintenance requests.</li>
            <li>• Coordinate caretakers, owners and tenants with role-based dashboards.</li>
            <li>• Keep an auditable record of every transaction and decision.</li>
          </ul>
        </div>
      </section>
    </MarketingShell>
  );
}
