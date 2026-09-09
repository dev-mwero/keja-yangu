"use client";

import { useState, useEffect } from "react";

export interface Property {
  _id: string;
  title: string;
  type: "room" | "apartment" | "building";
  location: string;
  price: number;
  description: string;
  images: string[];
  amenities: string[];
  status: "available" | "occupied" | "maintenance";
  ownerId: string;
  caretakerIds: string[];
  beds: number;
  baths: number;
  area: number;
}

export function useProperties() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProperties = async () => {
      try {
        const res = await fetch("/api/v1/properties");
        const json = await res.json();
        if (res.ok) {
          setProperties(json.data);
        } else {
          setError(json.error || "Failed to fetch properties");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      } finally {
        setLoading(false);
      }
    };

    fetchProperties();
  }, []);

  return { properties, loading, error };
}
