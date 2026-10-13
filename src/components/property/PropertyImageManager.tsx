"use client";

import { ArrowLeft, ArrowRight, GripVertical, ImageOff, Star, Trash2 } from "lucide-react";
import Image from "next/image";
import { type ReactNode, useRef } from "react";
import {
  moveImage,
  parseImageUrls,
  removeImageAt,
  serializeImageUrls,
  setCoverImage,
} from "@/lib/images";
import { cn } from "@/lib/utils";

interface PropertyImageManagerProps {
  /** Newline-joined image URLs (the shape stored on the form field). */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

const IconButton = ({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:h-3.5 [&_svg]:w-3.5"
  >
    {children}
  </button>
);

/**
 * Thumbnail grid for managing a property's images: remove, set the cover, and
 * reorder (drag-and-drop or the move buttons). Emits the newline-joined URL
 * string so it stays compatible with the existing form field.
 */
export const PropertyImageManager = ({
  value,
  onChange,
  disabled = false,
  className,
}: PropertyImageManagerProps) => {
  const urls = parseImageUrls(value);
  const dragIndex = useRef<number | null>(null);
  const update = (next: string[]) => onChange(serializeImageUrls(next));

  if (urls.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center gap-1 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center",
          className,
        )}
      >
        <ImageOff className="h-5 w-5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          No images yet. Upload files or add URLs below.
        </p>
      </div>
    );
  }

  return (
    <ul className={cn("grid grid-cols-3 gap-3 sm:grid-cols-4", className)}>
      {urls.map((url, index) => (
        <li
          key={`${url}-${index}`}
          draggable={!disabled}
          onDragStart={() => {
            dragIndex.current = index;
          }}
          onDragOver={(event) => {
            if (dragIndex.current !== null) event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            const from = dragIndex.current;
            dragIndex.current = null;
            if (from === null || from === index) return;
            update(moveImage(urls, from, index));
          }}
          className="group relative overflow-hidden rounded-xl border border-border bg-muted"
        >
          <div className="relative aspect-[4/3]">
            <Image src={url} alt="" fill sizes="120px" className="object-cover" />
          </div>

          <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-full bg-background/90 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-soft backdrop-blur">
            <GripVertical className="h-3 w-3" />
            {index + 1}
          </span>

          {index === 0 && (
            <span className="absolute right-1 top-1 inline-flex items-center gap-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground shadow-soft">
              <Star className="h-3 w-3" />
              Cover
            </span>
          )}

          <div className="flex items-center justify-between gap-1 border-t border-border bg-card/95 px-1 py-1">
            <div className="flex gap-0.5">
              <IconButton
                label={`Move image ${index + 1} left`}
                disabled={disabled || index === 0}
                onClick={() => update(moveImage(urls, index, index - 1))}
              >
                <ArrowLeft />
              </IconButton>
              <IconButton
                label={`Move image ${index + 1} right`}
                disabled={disabled || index === urls.length - 1}
                onClick={() => update(moveImage(urls, index, index + 1))}
              >
                <ArrowRight />
              </IconButton>
            </div>
            <div className="flex gap-0.5">
              {index > 0 && (
                <IconButton
                  label={`Set image ${index + 1} as cover`}
                  disabled={disabled}
                  onClick={() => update(setCoverImage(urls, index))}
                >
                  <Star />
                </IconButton>
              )}
              <IconButton
                label={`Remove image ${index + 1}`}
                disabled={disabled}
                onClick={() => update(removeImageAt(urls, index))}
              >
                <Trash2 />
              </IconButton>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
};
