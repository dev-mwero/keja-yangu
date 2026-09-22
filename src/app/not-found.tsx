"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Page not found</p>
        <p className="mb-8 text-sm text-muted-foreground">The page you're looking for doesn't exist or has been moved.</p>
        <Link href="/" className="rounded-full bg-primary px-6 py-3 text-primary-foreground hover:bg-primary/90">
          Return Home
        </Link>
      </div>
    </div>
  );
}
