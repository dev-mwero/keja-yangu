import type { Metadata } from "next";
import { MarketingShell } from "@/components/MarketingShell";
import { Faq } from "@/components/marketing/Faq";
import { Features } from "@/components/marketing/Features";
import { FinalCta } from "@/components/marketing/FinalCta";
import { Hero } from "@/components/marketing/Hero";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { PropertyShowcase } from "@/components/marketing/PropertyShowcase";
import { StatsBand } from "@/components/marketing/StatsBand";
import { BRAND_TITLE, BRAND_TITLE_TEMPLATE } from "@/lib/brand";

export const metadata: Metadata = {
  title: { default: BRAND_TITLE, template: BRAND_TITLE_TEMPLATE },
  description:
    "Find homes, manage properties, and connect tenants, caretakers, and owners on one platform.",
};

export default function HomePage() {
  return (
    <MarketingShell>
      <Hero />
      <StatsBand />
      <PropertyShowcase />
      <Features />
      <HowItWorks />
      <Faq />
      <FinalCta />
    </MarketingShell>
  );
}
