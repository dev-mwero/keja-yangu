"use client";

import { Heart } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { PropertyCard } from "@/components/PropertyCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UnitFavoriteButton } from "@/components/units/UnitFavoriteButton";
import { tenantNav } from "@/config/dashboardNav";
import type { Property } from "@/data/properties";
import { formatKES } from "@/lib/format";

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

interface FavouriteUnit {
  _id: string;
  name: string;
  blockName: string;
  floorLevel: number;
  floorLabel?: string;
  status: "available" | "occupied" | "maintenance";
  rent: number | null;
  beds: number;
  baths: number;
  area: number;
  property: {
    _id: string;
    title: string;
    location: string;
    price: number;
    images: string[];
  };
}

type Tab = "properties" | "units";

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

const statusClass: Record<FavouriteUnit["status"], string> = {
  available: "bg-success/15 text-success border-success/30",
  occupied: "bg-muted text-muted-foreground border-border",
  maintenance: "bg-warning/15 text-warning border-warning/40",
};

export default function TenantFavouritesPage() {
  const [tab, setTab] = useState<Tab>("properties");
  const [properties, setProperties] = useState<FavouriteProperty[]>([]);
  const [propertyLoading, setPropertyLoading] = useState(true);
  const [propertyError, setPropertyError] = useState<string | null>(null);
  const [propertyPage, setPropertyPage] = useState(1);
  const [propertyTotalPages, setPropertyTotalPages] = useState(0);
  const [units, setUnits] = useState<FavouriteUnit[]>([]);
  const [unitLoading, setUnitLoading] = useState(true);
  const [unitError, setUnitError] = useState<string | null>(null);
  const [unitPage, setUnitPage] = useState(1);
  const [unitTotalPages, setUnitTotalPages] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPropertyLoading(true);
    fetch(`/api/v1/favourites?page=${propertyPage}&limit=12`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load favourites");
        if (!cancelled) {
          setProperties(body.data as FavouriteProperty[]);
          setPropertyTotalPages(body.pagination.totalPages);
          setPropertyError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setPropertyError(cause instanceof Error ? cause.message : "Could not load favourites");
        }
      })
      .finally(() => {
        if (!cancelled) setPropertyLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [propertyPage]);

  useEffect(() => {
    if (tab !== "units") return;
    let cancelled = false;
    setUnitLoading(true);
    fetch(`/api/v1/favourites/units?page=${unitPage}&limit=12`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load unit favourites");
        if (!cancelled) {
          setUnits(body.data as FavouriteUnit[]);
          setUnitTotalPages(body.pagination.totalPages);
          setUnitError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setUnitError(cause instanceof Error ? cause.message : "Could not load unit favourites");
        }
      })
      .finally(() => {
        if (!cancelled) setUnitLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tab, unitPage]);

  return (
    <DashboardShell
      roleName="Tenant"
      nav={tenantNav}
      title="My favourites"
      subtitle="The homes and units you have saved for later."
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
          <TabsList>
            <TabsTrigger value="properties">Properties</TabsTrigger>
            <TabsTrigger value="units">Units</TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="text-sm text-muted-foreground">
          You will get an in-app notification when a saved unit becomes available.
        </p>
      </div>

      {tab === "properties" ? (
        <>
          {propertyLoading ? (
            <p className="text-muted-foreground">Loading favourites...</p>
          ) : propertyError ? (
            <p role="alert" className="text-destructive">
              {propertyError}
            </p>
          ) : properties.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
              <Heart className="mx-auto h-8 w-8 text-muted-foreground" />
              <h2 className="mt-3 font-display text-xl">No favourite properties yet</h2>
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
                      setProperties((current) =>
                        current.filter((saved) => saved._id !== property._id),
                      );
                    }
                  }}
                />
              ))}
            </div>
          )}
          {!propertyLoading && propertyTotalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-4">
              <Button
                variant="outline"
                disabled={propertyPage <= 1}
                onClick={() => setPropertyPage((current) => current - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {propertyPage} of {propertyTotalPages}
              </span>
              <Button
                variant="outline"
                disabled={propertyPage >= propertyTotalPages}
                onClick={() => setPropertyPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      ) : unitLoading ? (
        <p className="text-muted-foreground">Loading saved units...</p>
      ) : unitError ? (
        <p role="alert" className="text-destructive">
          {unitError}
        </p>
      ) : units.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <Heart className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 font-display text-xl">No saved units yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Save a specific unit and you will be notified when it becomes available.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {units.map((unit) => (
              <div
                key={unit._id}
                className="rounded-2xl border border-border bg-card p-5 shadow-soft"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-semibold">Unit {unit.name}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {unit.blockName ? `Block ${unit.blockName} · ` : ""}
                      {unit.floorLabel ? unit.floorLabel : `Floor ${unit.floorLevel}`}
                    </p>
                    <Link
                      href={`/properties/${unit.property._id}`}
                      className="mt-2 block text-sm font-medium text-primary hover:underline"
                    >
                      {unit.property.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">{unit.property.location}</p>
                  </div>
                  <UnitFavoriteButton
                    unitId={unit._id}
                    onChange={(favourited) => {
                      if (!favourited) {
                        setUnits((current) => current.filter((saved) => saved._id !== unit._id));
                      }
                    }}
                  />
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                  <Badge
                    variant="outline"
                    className={`rounded-full capitalize ${statusClass[unit.status]}`}
                  >
                    {unit.status}
                  </Badge>
                  <span className="text-sm font-medium">
                    {formatKES(unit.rent ?? unit.property.price)}
                    <span className="text-xs font-normal text-muted-foreground"> / month</span>
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>{unit.beds} bed</span>
                  <span>{unit.baths} bath</span>
                  <span>{unit.area} m²</span>
                </div>

                <Button asChild size="sm" variant="outline" className="mt-4 w-full rounded-full">
                  <Link href={`/properties/${unit.property._id}`}>
                    {unit.status === "available" ? "View and request" : "View property"}
                  </Link>
                </Button>
              </div>
            ))}
          </div>
          {unitTotalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-4">
              <Button
                variant="outline"
                disabled={unitPage <= 1}
                onClick={() => setUnitPage((current) => current - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {unitPage} of {unitTotalPages}
              </span>
              <Button
                variant="outline"
                disabled={unitPage >= unitTotalPages}
                onClick={() => setUnitPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </DashboardShell>
  );
}
