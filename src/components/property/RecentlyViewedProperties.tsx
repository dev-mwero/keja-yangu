"use client";

import { useEffect, useState } from "react";
import { PropertyCard } from "@/components/PropertyCard";
import type { Property } from "@/data/properties";

interface RecentlyViewedProperty {
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

export function RecentlyViewedProperties() {
  const [properties, setProperties] = useState<RecentlyViewedProperty[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/properties/recently-viewed")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load recently viewed homes");
        if (!cancelled) setProperties(body.data as RecentlyViewedProperty[]);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : "Could not load recently viewed homes");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (properties.length === 0) {
    return error ? (
      <p role="alert" className="mt-8 text-sm text-destructive">
        {error}
      </p>
    ) : null;
  }

  return (
    <section className="mt-12">
      <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight">Recently viewed</h2>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {properties.map((property) => (
          <PropertyCard
            key={property._id}
            property={{
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
            }}
          />
        ))}
      </div>
    </section>
  );
}
