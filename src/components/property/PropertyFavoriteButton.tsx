"use client";

import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

interface PropertyFavoriteButtonProps {
  propertyId: string;
  canAdd?: boolean;
  onChange?: (favourited: boolean) => void;
}

export function PropertyFavoriteButton({
  propertyId,
  canAdd = true,
  onChange,
}: PropertyFavoriteButtonProps) {
  const { user } = useAuth();
  const router = useRouter();
  const validPropertyId = /^[a-f\d]{24}$/i.test(propertyId);
  const [favourited, setFavourited] = useState(false);
  const [loading, setLoading] = useState(Boolean(user));

  useEffect(() => {
    if (!user || !validPropertyId) {
      setFavourited(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch(`/api/v1/favourites/${propertyId}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load favourite status");
        if (!cancelled) setFavourited(Boolean(body.data?.favourited));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          toast.error("Could not load favourite status", {
            description: error instanceof Error ? error.message : "Please try again.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [propertyId, user, validPropertyId]);

  const toggle = async () => {
    if (!validPropertyId) return;
    if (!user) {
      router.push(`/auth?from=/properties/${propertyId}`);
      return;
    }

    const previous = favourited;
    const next = !previous;
    setFavourited(next);
    setLoading(true);
    try {
      const response = await fetch(
        previous ? `/api/v1/favourites/${propertyId}` : "/api/v1/favourites",
        previous
          ? { method: "DELETE" }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ propertyId }),
            },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not update favourite");
      const savedState = Boolean(body.data?.favourited);
      setFavourited(savedState);
      onChange?.(savedState);
    } catch (error) {
      setFavourited(previous);
      toast.error("Could not update favourite", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!validPropertyId) return null;

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      aria-label={favourited ? "Remove from favourites" : "Add to favourites"}
      aria-pressed={favourited}
      disabled={loading || (!canAdd && !favourited)}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void toggle();
      }}
      className="rounded-full shadow-soft"
    >
      <Heart className={favourited ? "fill-current text-destructive" : ""} />
    </Button>
  );
}
