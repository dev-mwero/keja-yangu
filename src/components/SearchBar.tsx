"use client";

import { Building2, DoorOpen, FileText, Loader2, Search, UserCog, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ResultType = "property" | "unit" | "tenant" | "lease" | "invoice" | "staff";

interface SearchResult {
  id: string;
  type: ResultType;
  title: string;
  subtitle: string;
  href: string;
}

const ICONS: Record<ResultType, typeof Search> = {
  property: Building2,
  unit: DoorOpen,
  tenant: Users,
  lease: FileText,
  invoice: FileText,
  staff: UserCog,
};

export function SearchBar({ className }: { className?: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(trimmed)}`);
        const json = await res.json();
        if (!cancelled && res.ok) setResults(json.data ?? []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const showPanel = open && query.trim().length >= 2;
  const hasResults = results.length > 0;

  const content = useMemo(
    () =>
      results.map((r) => {
        const Icon = ICONS[r.type];
        return (
          <Link
            key={`${r.type}-${r.id}`}
            href={r.href}
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted"
          >
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{r.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{r.subtitle}</span>
            </span>
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
              {r.type}
            </span>
          </Link>
        );
      }),
    [results],
  );

  return (
    <div ref={containerRef} className={cn("relative w-full max-w-xs", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search…"
        aria-label="Search"
        className="pl-8"
      />
      {showPanel && (
        <div className="absolute z-50 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          )}
          {!loading && !hasResults && (
            <p className="px-3 py-2 text-sm text-muted-foreground">No matches found.</p>
          )}
          {!loading && content}
        </div>
      )}
    </div>
  );
}
