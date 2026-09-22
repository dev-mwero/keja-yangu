import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/Logo";

export default function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-2">
      <div className="relative hidden overflow-hidden lg:block">
        <Image
          src="/images/hero-building.jpg"
          alt="Modern apartment building"
          fill
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-secondary/80 via-secondary/40 to-transparent" />
        <div className="relative flex h-full flex-col justify-between p-10 text-secondary-foreground">
          <Logo className="text-secondary-foreground" />
          <div className="max-w-md">
            <p className="text-xs font-medium uppercase tracking-widest text-primary-glow">
              The new way to rent
            </p>
            <h2 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight">
              Where home <span className="italic text-primary-glow">begins</span>.
            </h2>
            <p className="mt-4 text-sm text-secondary-foreground/70">
              Sign in to track applications, manage units, or oversee your portfolio — all in one
              calm, modern space.
            </p>
          </div>
        </div>
      </div>

      <div className="relative flex min-h-screen flex-col px-6 py-8 lg:px-12">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back home
          </Link>
          <Logo className="lg:hidden" />
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">
          <h1 className="font-display text-4xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Keja
        </p>
      </div>
    </div>
  );
}
