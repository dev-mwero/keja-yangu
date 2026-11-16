import Link from "next/link";

import { BRAND } from "@/lib/brand";
import { Logo } from "./Logo";

const footerLinks: { label: string; href: string }[] = [
  { label: "About", href: "/about" },
  { label: "Pricing", href: "/pricing" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact", href: "/contact" },
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
];

const productLinks: { label: string; href: string }[] = [
  { label: "Find a home", href: "/properties" },
  { label: "For owners", href: "/dashboard/admin" },
  { label: "Sign in", href: "/auth" },
];

export const SiteFooter = () => {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-background">
      <div className="container py-12 md:py-16">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <Logo />
            <p className="mt-4 max-w-sm text-sm text-muted-foreground">
              {BRAND.tagline}. {BRAND.name} brings tenants, caretakers, and owners together on one
              calm, modern platform.
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              Support:{" "}
              <a
                href={`mailto:${BRAND.emails.support}`}
                className="font-medium text-foreground hover:text-primary"
              >
                {BRAND.emails.support}
              </a>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 md:col-span-7 md:grid-cols-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Product</h3>
              <ul className="mt-3 space-y-2">
                {productLinks.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Company</h3>
              <ul className="mt-3 space-y-2">
                {footerLinks.slice(0, 4).map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Legal</h3>
              <ul className="mt-3 space-y-2">
                {footerLinks.slice(4).map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 text-sm text-muted-foreground md:flex-row">
          <p>
            &copy; {year} {BRAND.name}. Crafted with care.
          </p>
          <p className="flex items-center gap-3">
            <span>Where home begins.</span>
            <a
              href="https://x.com/custodianhomes"
              className="transition-colors hover:text-foreground"
              aria-label="X (Twitter)"
            >
              @custodianhomes
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
};
