"use client";

import Link from "next/link";
import { BRAND } from "@/lib/brand";

const [primaryWord, ...secondaryWords] = BRAND.name.split(" ");
const secondaryWord = secondaryWords.join(" ");

export const Logo = ({ className = "" }: { className?: string }) => (
  <Link href="/" className={`group inline-flex items-center gap-2 ${className}`}>
    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg gradient-warm shadow-elevated">
      <span className="font-display text-lg font-bold text-primary-foreground">
        {primaryWord.charAt(0)}
      </span>
    </span>
    <span className="whitespace-nowrap font-display text-lg font-semibold tracking-tight sm:text-xl">
      {primaryWord}
      {secondaryWord ? <span className="font-normal opacity-60"> {secondaryWord}</span> : null}
    </span>
  </Link>
);
