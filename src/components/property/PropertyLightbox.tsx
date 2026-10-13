"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Image from "next/image";
import { type MouseEvent, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

const FALLBACK_IMAGE = "/images/property-1.jpg";

interface PropertyLightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: string[];
  title: string;
  index: number;
  onIndexChange: (index: number) => void;
}

const NavButton = ({
  side,
  label,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) => (
  <button
    type="button"
    aria-label={label}
    onClick={onClick}
    className={cn(
      "absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white backdrop-blur transition-colors hover:bg-white/20",
      side === "left" ? "left-4" : "right-4",
    )}
  >
    {side === "left" ? <ChevronLeft className="h-6 w-6" /> : <ChevronRight className="h-6 w-6" />}
  </button>
);

/**
 * Full-screen gallery viewer for a property's images. Built on Radix Dialog so
 * it gets focus trapping, focus restore and Escape-to-close for free; adds
 * arrow-key navigation, prev/next controls, a counter and a thumbnail rail.
 */
export const PropertyLightbox = ({
  open,
  onOpenChange,
  images,
  title,
  index,
  onIndexChange,
}: PropertyLightboxProps) => {
  const gallery = images.length > 0 ? images : [FALLBACK_IMAGE];
  const count = gallery.length;
  const safeIndex = ((index % count) + count) % count;

  const go = useCallback(
    (delta: number) => {
      onIndexChange((safeIndex + delta + count) % count);
    },
    [count, onIndexChange, safeIndex],
  );

  useEffect(() => {
    if (!open || count <= 1) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        go(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, count, go]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/90 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed inset-0 z-50 flex flex-col focus:outline-none">
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {`Image ${safeIndex + 1} of ${count}`}
          </DialogPrimitive.Description>

          <div className="flex items-center justify-between p-4 text-white/90">
            <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-medium tabular-nums backdrop-blur">
              {safeIndex + 1} / {count}
            </span>
            <DialogPrimitive.Close
              aria-label="Close gallery"
              className="rounded-full bg-white/10 p-2 backdrop-blur transition-colors hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>

          {/* The stage backdrop is a real button so clicking outside the image closes the viewer. */}
          <div className="relative flex-1">
            <button
              type="button"
              aria-label="Close photo gallery"
              onClick={() => onOpenChange(false)}
              className="absolute inset-0 cursor-zoom-out"
            />
            <Image
              src={gallery[safeIndex] ?? FALLBACK_IMAGE}
              alt={`${title} — image ${safeIndex + 1}`}
              fill
              sizes="100vw"
              priority
              className="pointer-events-none object-contain"
            />
            {count > 1 && (
              <>
                <NavButton
                  side="left"
                  label="Previous image"
                  onClick={(event) => {
                    event.stopPropagation();
                    go(-1);
                  }}
                />
                <NavButton
                  side="right"
                  label="Next image"
                  onClick={(event) => {
                    event.stopPropagation();
                    go(1);
                  }}
                />
              </>
            )}
          </div>

          {count > 1 && (
            <div className="flex justify-center gap-2 overflow-x-auto p-4">
              {gallery.map((image, i) => (
                <button
                  key={`${image}-${i}`}
                  type="button"
                  aria-label={`Show image ${i + 1}`}
                  aria-current={i === safeIndex}
                  onClick={() => onIndexChange(i)}
                  className={cn(
                    "relative h-14 w-20 shrink-0 overflow-hidden rounded-lg transition-opacity",
                    i === safeIndex ? "ring-2 ring-white" : "opacity-60 hover:opacity-100",
                  )}
                >
                  <Image src={image} alt="" fill sizes="80px" className="object-cover" />
                </button>
              ))}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
