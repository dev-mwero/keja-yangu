import type { Metadata } from "next";

import ContactForm from "@/components/contact/ContactForm";
import { MarketingShell } from "@/components/MarketingShell";
import { BRAND, BRAND_TITLE_TEMPLATE } from "@/lib/brand";

export const metadata: Metadata = {
  title: { default: "Contact", template: BRAND_TITLE_TEMPLATE },
  description: `Contact ${BRAND.name} support — questions about listings, leases, or the platform.`,
};

export default function ContactPage() {
  return (
    <MarketingShell>
      <ContactForm />
    </MarketingShell>
  );
}
