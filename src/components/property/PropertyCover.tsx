"use client";

import { Images } from "lucide-react";
import Image from "next/image";
import { type MouseEvent, useState } from "react";
import { cn } from "@/lib/utils";

const FALLBACK_IMAGE = "/images/property-1.jpg";

interface PropertyCoverProps {
  images: string[];
  title: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  imageClassName?: string;
  /** Overrides the position of the photo-count pill (defaults to bottom-left). */
  badgeClassName?: string;
  /** Hide the bottom-center position dots (useful when the host has its own footer). */
  showDots?: boolean;
}

/**
 * Renders a property's cover image with an at-a-glance indicator of how many
 * photos the listing has. On devices with a pointer, moving across the image
 * cycles through the gallery so the cover surface shows more than just the
 * first upload. Pure visual affordance: it renders no nested interactive
 * controls, so it is safe to place inside a `<Link>`.
 */
export const PropertyCover = ({
  images,
  title,
  sizes,
  priority = false,
  className,
  imageClassName,
  badgeClassName,
  showDots = true,
}: PropertyCoverProps) => {
  const gallery = images.length > 0 ? images : [FALLBACK_IMAGE];
  const count = gallery.length;
  const [active, setActive] = useState(0);
  const safeActive = Math.min(active, count - 1);
  const src = gallery[safeActive] ?? FALLBACK_IMAGE;

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (count <= 1) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    const next = Math.floor(ratio * count);
    if (!Number.isFinite(next)) return;
    setActive(Math.min(count - 1, Math.max(0, next)));
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: decorative hover-to-cycle, no semantic action
    <div className={cn("relative h-full w-full", className)} onMouseMove={handleMouseMove}>
      <Image
        src={src}
        alt={title}
        fill
        sizes={sizes}
        priority={priority}
        className={cn("h-full w-full object-cover", imageClassName)}
      />

      {count > 1 && (
        <>
          <div
            className={cn(
              "pointer-events-none absolute flex items-center gap-1.5 rounded-full bg-background/95 px-2.5 py-1 text-xs font-semibold shadow-soft backdrop-blur",
              badgeClassName ?? "bottom-4 left-4",
            )}
            aria-hidden="true"
          >
            <Images className="h-3.5 w-3.5" />
            {safeActive + 1}/{count}
          </div>
          {showDots && (
            <div
              className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5"
              aria-hidden="true"
              data-testid="gallery-dots"
            >
              {gallery.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 rounded-full bg-background/90 shadow-soft transition-all",
                    i === safeActive ? "w-4" : "w-1.5 opacity-70",
                  )}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
