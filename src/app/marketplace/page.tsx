"use client";

import { Bath, BedDouble, MapPin, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
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
import type { PublicListingProjection } from "@/lib/listings";

export default function MarketplacePage() {
  const [listings, setListings] = useState<PublicListingProjection[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [propertyType, setPropertyType] = useState("all");
  const [county, setCounty] = useState("");
  const [maxRent, setMaxRent] = useState<number | "">("");

  useEffect(() => {
    let ignore = false;
    setLoading(true);

    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (propertyType !== "all") params.set("propertyType", propertyType);
    if (county.trim()) params.set("county", county.trim());
    if (maxRent !== "" && !Number.isNaN(Number(maxRent))) {
      params.set("maxRent", String(maxRent));
    }

    fetch(`/api/v1/marketplace/listings?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (!ignore) {
          setListings(data.listings || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [search, propertyType, county, maxRent]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="container py-10">
        <div className="mb-8 max-w-3xl">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Unit Marketplace
          </div>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight md:text-5xl">
            Find your next home by unit.
          </h1>
          <p className="mt-2 text-muted-foreground md:text-lg">
            Direct canonical unit listings with guaranteed vacancy and verified rents.
          </p>
        </div>

        {/* Filter bar */}
        <div className="mb-8 grid gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm md:grid-cols-4">
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
        </div>

        {/* Listings Grid */}
        {loading ? (
          <div className="py-20 text-center text-muted-foreground">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            Loading listings...
          </div>
        ) : listings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border py-20 text-center">
            <SlidersHorizontal className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" />
            <h3 className="text-lg font-semibold">No listings found</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Try adjusting your search criteria or clearing filters.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setSearch("");
                setPropertyType("all");
                setCounty("");
                setMaxRent("");
              }}
            >
              Reset Filters
            </Button>
          </div>
        ) : (
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
        )}
      </main>
    </div>
  );
}
