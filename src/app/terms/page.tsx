import type { Metadata } from "next";

import { MarketingShell } from "@/components/MarketingShell";
import { BRAND, BRAND_TITLE_TEMPLATE } from "@/lib/brand";

export const metadata: Metadata = {
  title: { default: "Terms of Service", template: BRAND_TITLE_TEMPLATE },
  description: `Terms of Service for ${BRAND.name}.`,
};

export default function TermsPage() {
  return (
    <MarketingShell>
      <article className="container max-w-3xl py-16 md:py-24">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">Legal</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight md:text-5xl">
          Terms of Service
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">Last updated: 2026-11-14</p>

        <div className="prose mt-8 max-w-none space-y-6 text-muted-foreground">
          <p>
            These Terms govern your use of {BRAND.name} ("the Platform"). By creating an account or
            using the Platform, you agree to these Terms.
          </p>
          <h2 className="font-display text-xl font-semibold text-foreground">1. Accounts</h2>
          <p>
            You are responsible for keeping your credentials secure and for all activity under your
            account. Provide accurate information when signing up.
          </p>
          <h2 className="font-display text-xl font-semibold text-foreground">
            2. Listings & leases
          </h2>
          <p>
            Listings must be accurate. Leases, invoices and payments are binding between the parties
            involved; the Platform facilitates but does not become a party to them.
          </p>
          <h2 className="font-display text-xl font-semibold text-foreground">3. Payments</h2>
          <p>
            Payments are processed by third-party providers (M-Pesa, Paystack). The Platform is not
            liable for provider downtime or failed transactions beyond retrying and recording
            status.
          </p>
          <h2 className="font-display text-xl font-semibold text-foreground">4. Acceptable use</h2>
          <p>
            Do not misuse the Platform, scrape data, or attempt to access other users' accounts.
            Violations may result in suspension.
          </p>
          <h2 className="font-display text-xl font-semibold text-foreground">
            5. Limitation of liability
          </h2>
          <p>
            The Platform is provided "as is". To the maximum extent permitted by law, {BRAND.name}{" "}
            is not liable for indirect or consequential damages arising from use of the Platform.
          </p>
          <h2 className="font-display text-xl font-semibold text-foreground">6. Contact</h2>
          <p>
            Questions about these Terms:{" "}
            <a href={`mailto:${BRAND.emails.support}`} className="text-primary hover:underline">
              {BRAND.emails.support}
            </a>
            .
          </p>
        </div>
      </article>
    </MarketingShell>
  );
}
