import { useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { PropertyCard } from "@/components/PropertyCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { properties, type PropertyType } from "@/data/properties";

const types: ("all" | PropertyType)[] = ["all", "room", "apartment", "building"];

const Properties = () => {
  const [q, setQ] = useState("");
  const [type, setType] = useState<(typeof types)[number]>("all");
  const [maxPrice, setMaxPrice] = useState(250000);

  const filtered = useMemo(
    () =>
      properties.filter((p) => {
        if (type !== "all" && p.type !== type) return false;
        if (p.price > maxPrice) return false;
        if (q && !`${p.title} ${p.location}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [q, type, maxPrice]
  );

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="container py-12">
        <div className="mb-10 max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">Browse</p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight md:text-5xl">
            Every home, beautifully sorted.
          </h1>
          <p className="mt-3 text-muted-foreground">
            Use filters to narrow down by type, location, and price. {filtered.length} of {properties.length} match.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-12">
          <aside className="lg:col-span-3">
            <div className="sticky top-24 space-y-6 rounded-2xl border border-border bg-card p-5 shadow-soft">
              <div className="flex items-center gap-2 text-sm font-medium">
                <SlidersHorizontal className="h-4 w-4 text-primary" /> Filters
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Search</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Location or name" className="pl-9" />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Type</label>
                <div className="flex flex-wrap gap-2">
                  {types.map((t) => (
                    <button
                      key={t}
                      onClick={() => setType(t)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-all ${
                        type === t
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Max price</label>
                  <span className="text-sm font-semibold">KES {maxPrice.toLocaleString()}</span>
                </div>
                <Slider value={[maxPrice]} onValueChange={(v) => setMaxPrice(v[0])} min={10000} max={250000} step={5000} />
              </div>

              <Button
                variant="outline"
                className="w-full rounded-full"
                onClick={() => { setQ(""); setType("all"); setMaxPrice(250000); }}
              >
                Reset filters
              </Button>
            </div>
          </aside>

          <div className="lg:col-span-9">
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
                <p className="font-display text-xl">No matches found</p>
                <p className="mt-2 text-sm text-muted-foreground">Try widening your filters.</p>
              </div>
            ) : (
              <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((p, i) => <PropertyCard key={p.id} property={p} index={i} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Properties;