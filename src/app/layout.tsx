import type { Metadata } from "next";
import "@/app/globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/hooks/use-auth";

export const metadata: Metadata = {
  title: {
    default: "Keja Yangu — Property Rentals & Tenant Management",
    template: "%s | Keja Yangu",
  },
  description: "Find homes, manage properties, and connect tenants, caretakers, and owners on one platform.",
  keywords: ["rentals", "property", "tenant management", "Kenya", "housing"],
  authors: [{ name: "Keja Yangu" }],
  creator: "Keja Yangu",
  publisher: "Keja Yangu",
  openGraph: {
    type: "website",
    locale: "en_KE",
    url: "https://keja-yangu.com",
    siteName: "Keja Yangu",
    title: "Keja Yangu — Property Rentals & Tenant Management",
    description: "Find homes, manage properties, and connect tenants, caretakers, and owners on one platform.",
    images: [
      {
        url: "/images/hero-building.jpg",
        width: 1600,
        height: 1200,
        alt: "Keja Yangu",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Keja Yangu — Property Rentals & Tenant Management",
    description: "Find homes, manage properties, and connect tenants, caretakers, and owners on one platform.",
    creator: "@kejayangu",
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
      </body>
    </html>
  );
}
