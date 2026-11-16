import { ChevronDown } from "lucide-react";

const faqs = [
  {
    q: "How do I find a home on the platform?",
    a: "Browse the Properties or Marketplace pages, filter by type, location and price, then open a listing to view details and apply.",
  },
  {
    q: "Who can use the platform?",
    a: "Tenants, caretakers and property owners each get a tailored dashboard. Sign up and choose your role during onboarding.",
  },
  {
    q: "How are payments handled?",
    a: "Invoices are generated per lease period. Tenants pay online via M-Pesa or Paystack; receipts and balances are tracked in the dashboard.",
  },
  {
    q: "Can I manage multiple properties?",
    a: "Yes. Owners get a full hierarchy view across properties, units, blocks and tenants, with analytics and assignment tools.",
  },
  {
    q: "Is my data secure?",
    a: "All traffic is HTTPS, sessions are httpOnly cookies, and sensitive fields are encrypted at rest. See our Privacy page for details.",
  },
  {
    q: "How do I contact support?",
    a: "Use the Contact page or email support@custodianhomes.co.ke. We respond within one business day.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export const Faq = () => {
  return (
    <section className="border-t border-border">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static, trusted content
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="container py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">FAQ</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-balance md:text-5xl">
            Questions, answered.
          </h2>
        </div>
        <div className="mx-auto mt-12 max-w-3xl divide-y divide-border rounded-2xl border border-border bg-card">
          {faqs.map((f) => (
            <details key={f.q} className="group px-6 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left font-medium text-foreground [&::-webkit-details-marker]:hidden">
                <span>{f.q}</span>
                <ChevronDown
                  className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
};
