"use client";

import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { PropertyCard } from "@/components/PropertyCard";
import { Button } from "@/components/ui/button";
import { tenantNav } from "@/config/dashboardNav";
import type { Property } from "@/data/properties";

interface FavouriteProperty {
  _id: string;
  title: string;
  type: Property["type"];
  location: string;
  price: number;
  description: string;
  images: string[];
  amenities: string[];
  status: Property["status"];
  published: boolean;
  beds: number;
  baths: number;
  area: number;
}

const toCardProperty = (property: FavouriteProperty): Property => ({
  id: property._id,
  title: property.title,
  type: property.type,
  location: property.location,
  price: property.price,
  description: property.description,
  images: property.images?.length ? property.images : ["/images/property-1.jpg"],
  amenities: property.amenities ?? [],
  status: property.status,
  published: property.published,
  ownerId: "",
  caretakerIds: [],
  beds: property.beds,
  baths: property.baths,
  area: property.area,
});

export default function TenantFavouritesPage() {
  const [properties, setProperties] = useState<FavouriteProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/v1/favourites?page=${page}&limit=12`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load favourites");
        if (!cancelled) {
          setProperties(body.data as FavouriteProperty[]);
          setTotalPages(body.pagination.totalPages);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not load favourites");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page]);

  return (
    <DashboardShell
      roleName="Tenant"
      nav={tenantNav}
      title="My favourites"
      subtitle="The homes you have saved for later."
    >
      {loading ? (
        <p className="text-muted-foreground">Loading favourites...</p>
      ) : error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : properties.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <Heart className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 font-display text-xl">No favourites yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Save a home with the heart button and it will be waiting here.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {properties.map((property) => (
            <PropertyCard
              key={property._id}
              property={toCardProperty(property)}
              showFavouriteButton
              onFavouriteChange={(favourited) => {
                if (!favourited) {
                  setProperties((current) => current.filter((saved) => saved._id !== property._id));
                }
              }}
            />
          ))}
        </div>
      )}
      {!loading && totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-4">
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </DashboardShell>
  );
}
