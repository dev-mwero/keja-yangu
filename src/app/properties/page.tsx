"use client";

import { Bath, BedDouble, MapPin, Search, SlidersHorizontal } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PropertyCard } from "@/components/PropertyCard";
import { SiteHeader } from "@/components/SiteHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import type { Property } from "@/data/properties";
import { useProperties } from "@/hooks/use-properties";
import { usePropertyTypes } from "@/hooks/use-property-types";
import type { PublicListingProjection } from "@/lib/listings";

const UNITS_LIMIT = 20;

const Properties = () => {
  const [view, setView] = useState<"buildings" | "units">("buildings");

  // Buildings state
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [maxPrice, setMaxPrice] = useState(250000);
  const { properties: apiProperties } = useProperties();
  const { types: propertyTypes } = usePropertyTypes();
  const typeFilters = useMemo(
    () => [
      { key: "all", label: "All" },
      ...propertyTypes.map((t) => ({ key: t.key, label: t.label })),
    ],
    [propertyTypes],
  );
  const properties: Property[] = useMemo(
    () => apiProperties.map((p) => ({ ...p, id: p._id })),
    [apiProperties],
  );
  const filtered = useMemo(
    () =>
      properties.filter((p) => {
        if (type !== "all" && p.type !== type) return false;
        if (p.price > maxPrice) return false;
        if (q && !`${p.title} ${p.location}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [properties, q, type, maxPrice],
  );

  // Units (marketplace) state
  const [listings, setListings] = useState<PublicListingProjection[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [unitsError, setUnitsError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [propertyType, setPropertyType] = useState("all");
  const [county, setCounty] = useState("");
  const [maxRent, setMaxRent] = useState<number | "">("");
  const [beds, setBeds] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset page when any filter changes
  useEffect(() => {
    setPage(1);
  }, [search, propertyType, county, maxRent, beds]);

  useEffect(() => {
    if (view !== "units") return;
    let ignore = false;
    setUnitsLoading(true);
    setUnitsError(null);

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(UNITS_LIMIT));
    if (search.trim()) params.set("search", search.trim());
    if (propertyType !== "all") params.set("propertyType", propertyType);
    if (county.trim()) params.set("county", county.trim());
    if (maxRent !== "" && !Number.isNaN(Number(maxRent))) {
      params.set("maxRent", String(maxRent));
    }
    if (beds !== "") params.set("beds", beds);

    fetch(`/api/v1/marketplace/listings?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (ignore) return;
        setListings(data.listings || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 0);
        setUnitsLoading(false);
      })
      .catch(() => {
        if (ignore) return;
        setUnitsError("Failed to load listings");
        setUnitsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [view, search, propertyType, county, maxRent, beds, page]);

  const resetUnits = () => {
    setSearch("");
    setPropertyType("all");
    setCounty("");
    setMaxRent("");
    setBeds("");
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="container py-10">
        <div className="mb-6 max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">Browse</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight md:text-5xl">
            Find your next home.
          </h1>
          <p className="mt-2 text-muted-foreground md:text-lg">
            Browse buildings or drill down to individual units.
          </p>
        </div>

        <div className="mb-6 inline-flex rounded-full border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => setView("buildings")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
              view === "buildings"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Buildings
          </button>
          <button
            type="button"
            onClick={() => setView("units")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
              view === "units"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Units
          </button>
        </div>

        {view === "buildings" ? (
          <div className="grid gap-8 lg:grid-cols-12">
            <aside className="lg:col-span-3">
              <div className="sticky top-24 space-y-6 rounded-2xl border border-border bg-card p-5 shadow-soft">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <SlidersHorizontal className="h-4 w-4 text-primary" /> Filters
                </div>

                <div>
                  <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Search
                  </span>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Location or name"
                      className="pl-9"
                    />
                  </div>
                </div>

                <div>
                  <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Type
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {typeFilters.map((t) => (
                      <button
                        type="button"
                        key={t.key}
                        onClick={() => setType(t.key)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-all ${
                          type === t.key
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Max price
                    </span>
                    <span className="text-sm font-semibold">KES {maxPrice.toLocaleString()}</span>
                  </div>
                  <Slider
                    value={[maxPrice]}
                    onValueChange={(v) => setMaxPrice(v[0])}
                    min={10000}
                    max={250000}
                    step={5000}
                  />
                </div>

                <Button
                  variant="outline"
                  type="button"
                  className="w-full rounded-full"
                  onClick={() => {
                    setQ("");
                    setType("all");
                    setMaxPrice(250000);
                  }}
                >
                  Reset filters
                </Button>
              </div>
            </aside>

            <div className="lg:col-span-9">
              <p className="mb-4 text-sm text-muted-foreground">
                {filtered.length} of {properties.length} match.
              </p>
              {filtered.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
                  <p className="font-display text-xl">No matches found</p>
                  <p className="mt-2 text-sm text-muted-foreground">Try widening your filters.</p>
                </div>
              ) : (
                <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-3">
                  {filtered.map((p) => (
                    <PropertyCard key={p.id} property={p} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Filter bar */}
            <div className="mb-8 grid gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm md:grid-cols-5">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search headline or area..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select value={propertyType} onValueChange={setPropertyType}>
                <SelectTrigger>
                  <SelectValue placeholder="All Property Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="apartment">Apartment</SelectItem>
                  <SelectItem value="mansion">Mansion</SelectItem>
                  <SelectItem value="villa">Villa</SelectItem>
                  <SelectItem value="townhouse">Townhouse</SelectItem>
                  <SelectItem value="commercial">Commercial</SelectItem>
                </SelectContent>
              </Select>

              <Input
                placeholder="County or neighborhood..."
                value={county}
                onChange={(e) => setCounty(e.target.value)}
              />

              <Input
                type="number"
                placeholder="Max Rent (KES)"
                value={maxRent}
                onChange={(e) => setMaxRent(e.target.value ? Number(e.target.value) : "")}
              />

              <Select value={beds || "all"} onValueChange={(v) => setBeds(v === "all" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Beds" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Beds</SelectItem>
                  <SelectItem value="1">1 Bed</SelectItem>
                  <SelectItem value="2">2 Beds</SelectItem>
                  <SelectItem value="3">3 Beds</SelectItem>
                  <SelectItem value="4">4 Beds</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {unitsLoading ? "Loading..." : `${listings.length} of ${total} match.`}
              </p>
              <Button variant="outline" size="sm" className="rounded-full" onClick={resetUnits}>
                Reset Filters
              </Button>
            </div>

            {unitsLoading ? (
              <div className="py-20 text-center text-muted-foreground">
                <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                Loading listings...
              </div>
            ) : unitsError ? (
              <div className="rounded-2xl border border-dashed border-border py-20 text-center">
                <p className="text-lg font-semibold">Failed to load listings</p>
                <p className="mt-1 text-sm text-muted-foreground">{unitsError}</p>
              </div>
            ) : listings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border py-20 text-center">
                <SlidersHorizontal className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" />
                <h3 className="text-lg font-semibold">No listings found</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try adjusting your search criteria or clearing filters.
                </p>
              </div>
            ) : (
              <>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {listings.map((item) => {
                    const primaryImage =
                      item.media?.find((m) => m.isPrimary)?.url ||
                      item.media?.[0]?.url ||
                      "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80";

                    const href = `/marketplace/${item.publisher?.shareCode || item.id}`;

                    return (
                      <Link key={item.id} href={href} className="group block">
                        <div className="overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                          <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
                            <Image
                              src={primaryImage}
                              alt={item.headline}
                              fill
                              className="object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                            <Badge className="absolute left-3 top-3 bg-background/90 text-foreground backdrop-blur-md">
                              Unit {item.unit.name}
                            </Badge>
                            <Badge className="absolute right-3 top-3 bg-primary text-primary-foreground">
                              KES {item.askingRent.toLocaleString()}
                              <span className="text-xs font-normal">/mo</span>
                            </Badge>
                          </div>

                          <div className="p-5">
                            <p className="text-xs font-medium uppercase tracking-wider text-primary">
                              {item.property.title}
                            </p>
                            <h3 className="mt-1 text-lg font-semibold tracking-tight text-foreground line-clamp-1 group-hover:text-primary">
                              {item.headline}
                            </h3>

                            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{item.property.location}</span>
                            </div>

                            <div className="mt-4 flex items-center gap-4 border-t border-border pt-4 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <BedDouble className="h-4 w-4 text-foreground/70" />
                                <span>{item.unit.beds} Bed</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Bath className="h-4 w-4 text-foreground/70" />
                                <span>{item.unit.baths} Bath</span>
                              </div>
                              {item.unit.floorLabel && (
                                <div className="ml-auto text-xs font-medium text-foreground/80">
                                  {item.unit.floorLabel}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {totalPages > 1 && (
                  <div className="mt-8 flex items-center justify-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Properties;
