import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Keja Yangu",
  description: "Property rentals and tenant management for Keja Yangu.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
