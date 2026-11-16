import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import "@/app/globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/hooks/use-auth";
import { BRAND, BRAND_TITLE, BRAND_TITLE_TEMPLATE, getAppUrl } from "@/lib/brand";

const DESCRIPTION =
  "Find homes, manage properties, and connect tenants, caretakers, and owners on one platform.";

const appOrigin = getAppUrl();

export const metadata: Metadata = {
  // Without this every canonical/OG URL resolves against localhost in
  // production. Accept a host-only value in case the env var omits the scheme.
  metadataBase: new URL(/^https?:\/\//.test(appOrigin) ? appOrigin : `https://${appOrigin}`),
  title: {
    default: BRAND_TITLE,
    template: BRAND_TITLE_TEMPLATE,
  },
  description: DESCRIPTION,
  applicationName: BRAND.name,
  keywords: ["rentals", "property", "tenant management", "Kenya", "housing"],
  authors: [{ name: BRAND.name }],
  creator: BRAND.name,
  publisher: BRAND.name,
  openGraph: {
    type: "website",
    locale: "en_KE",
    url: BRAND.url,
    siteName: BRAND.name,
    title: BRAND_TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/images/hero-building.jpg",
        width: 1600,
        height: 1200,
        alt: BRAND.name,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND_TITLE,
    description: DESCRIPTION,
    creator: "@custodianhomes",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
