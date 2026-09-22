"use client";

import { MapPin } from "lucide-react";

interface PropertyMapProps {
  address: string;
  title?: string;
  className?: string;
}

export const PropertyMap = ({ address, title, className }: PropertyMapProps) => {
  const query = encodeURIComponent(address);
  const src = `https://maps.google.com/maps?q=${query}&z=15&output=embed`;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${query}`;

  return (
    <div className={className}>
      <div className="overflow-hidden rounded-2xl border border-border bg-muted">
        <iframe
          title={title ? `Map of ${title}` : `Map of ${address}`}
          src={src}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="h-[360px] w-full border-0"
        />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
        <p className="inline-flex items-center gap-2 text-muted-foreground">
          <MapPin className="h-4 w-4 text-primary" /> {address}
        </p>
        <a
          href={directions}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Get directions
        </a>
      </div>
    </div>
  );
};
