"use client";

import Link from "next/link";
import { MapPin, BedDouble, Bath, Maximize2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Property } from "@/data/properties";
import { cn } from "@/lib/utils";

const statusStyles: Record<Property["status"], string> = {
  available: "bg-success/15 text-success border-success/30",
  occupied: "bg-muted text-muted-foreground border-border",
  maintenance: "bg-warning/15 text-warning border-warning/40",
};

export const PropertyCard = ({ property, index = 0 }: { property: Property; index?: number }) => {
  return (
    <Link href={`/properties/${property.id}`} className="group block">
      <div className="relative overflow-hidden rounded-2xl bg-muted shadow-soft transition-all duration-500 hover:shadow-elevated">
        <div className="aspect-[4/3] overflow-hidden">
          <img
            src={property.images[0]}
            alt={property.title}
            loading="lazy"
            width={1200}
            height={900}
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />
        </div>
        <div className="absolute left-4 top-4 flex gap-2">
          <Badge variant="outline" className={cn("rounded-full border bg-background/90 backdrop-blur capitalize", statusStyles[property.status])}>
            {property.status}
          </Badge>
        </div>
        <div className="absolute bottom-4 right-4 rounded-full bg-background/95 px-3 py-1.5 text-sm font-semibold shadow-soft backdrop-blur">
          KES {property.price.toLocaleString()}<span className="text-muted-foreground">/mo</span>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-lg font-semibold leading-snug tracking-tight transition-colors group-hover:text-primary">
            {property.title}
          </h3>
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground">
            {property.type}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          <span>{property.location}</span>
        </div>
        <div className="flex items-center gap-4 pt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" />{property.beds}</span>
          <span className="flex items-center gap-1"><Bath className="h-3.5 w-3.5" />{property.baths}</span>
          <span className="flex items-center gap-1"><Maximize2 className="h-3.5 w-3.5" />{property.area}m²</span>
        </div>
      </div>
    </Link>
  );
};
