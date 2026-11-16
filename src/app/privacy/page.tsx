import type { Metadata } from "next";

import { MarketingShell } from "@/components/MarketingShell";
import { BRAND, BRAND_TITLE_TEMPLATE } from "@/lib/brand";

export const metadata: Metadata = {
  title: { default: "Privacy Policy", template: BRAND_TITLE_TEMPLATE },
  description: `Privacy Policy for ${BRAND.name}.`,
};

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <article className="container max-w-3xl py-16 md:py-24">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">Legal</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight md:text-5xl">
          Privacy Policy
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">Last updated: 2026-11-14</p>

        <div className="mt-8 space-y-6 text-muted-foreground">
          <p>
            This Policy describes how {BRAND.name} collects, uses and protects your personal
            information.
          </p>
          <h2 className="font-display text-xl font-semibold text-foreground">Data we collect</h2>
          <p>
            Account details (name, email, phone), property and lease information, payment records,
            and usage data needed to operate the Platform.
          </p>
          <h2 className="font-display text-xl font-semibold text-foreground">How we use it</h2>
          <p>
            To provide the service, process payments, send transactional emails, and improve the
            Platform. We do not sell personal data.
          </p>
          <h2 className="font-display text-xl font-semibold text-foreground">Security</h2>
          <p>
            Traffic is encrypted in transit (HTTPS). Sensitive fields are encrypted at rest. Access
            is role-based and audited.
          </p>
          <h2 className="font-display text-xl font-semibold text-foreground">Your rights</h2>
          <p>
            You may request access to or deletion of your data by contacting{" "}
            <a href={`mailto:${BRAND.emails.support}`} className="text-primary hover:underline">
              {BRAND.emails.support}
            </a>
            .
          </p>
          <h2 className="font-display text-xl font-semibold text-foreground">Cookies</h2>
          <p>
            We use a session cookie to keep you signed in and minimal local storage for UI state. No
            third-party tracking cookies.
          </p>
        </div>
      </article>
    </MarketingShell>
  );
}
