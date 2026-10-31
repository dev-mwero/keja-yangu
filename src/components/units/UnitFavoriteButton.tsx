"use client";

import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

interface UnitFavoriteButtonProps {
  unitId: string;
  onChange?: (favourited: boolean) => void;
}

export function UnitFavoriteButton({ unitId, onChange }: UnitFavoriteButtonProps) {
  const { user } = useAuth();
  const router = useRouter();
  const validUnitId = /^[a-f\d]{24}$/i.test(unitId);
  const [favourited, setFavourited] = useState(false);
  const [loading, setLoading] = useState(Boolean(user));

  useEffect(() => {
    if (!user || !validUnitId) {
      setFavourited(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch(`/api/v1/favourites/units/${unitId}`)
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
  }, [unitId, user, validUnitId]);

  const toggle = async () => {
    if (!validUnitId) return;
    if (!user) {
      const from = window.location.pathname + window.location.search;
      router.push(`/auth?from=${encodeURIComponent(from)}`);
      return;
    }

    const previous = favourited;
    const next = !previous;
    setFavourited(next);
    setLoading(true);
    try {
      const response = await fetch(
        previous ? `/api/v1/favourites/units/${unitId}` : "/api/v1/favourites/units",
        previous
          ? { method: "DELETE" }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ unitId }),
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

  if (!validUnitId) return null;

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      aria-label={favourited ? "Remove unit from favourites" : "Add unit to favourites"}
      aria-pressed={favourited}
      disabled={loading}
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
