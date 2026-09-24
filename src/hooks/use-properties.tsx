"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type PropertyStatus = "available" | "occupied" | "maintenance";

export interface Property {
  _id: string;
  title: string;
  type: "room" | "apartment" | "building";
  location: string;
  price: number;
  description: string;
  images: string[];
  amenities: string[];
  status: PropertyStatus;
  ownerId: string;
  caretakerIds: string[];
  beds: number;
  baths: number;
  area: number;
}

export interface PropertyInput {
  title: string;
  type: "room" | "apartment" | "building";
  location: string;
  price: number;
  description?: string;
  images?: string[];
  amenities?: string[];
  status?: PropertyStatus;
  beds?: number;
  baths?: number;
  area?: number;
  caretakerIds?: string[];
  targetOwnerId?: string;
}

export interface PropertyFilters {
  ownerId?: string;
  caretakerId?: string;
  status?: PropertyStatus;
}

export function useProperties(filters?: PropertyFilters) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters?.ownerId) params.set("ownerId", filters.ownerId);
    if (filters?.caretakerId) params.set("caretakerId", filters.caretakerId);
    if (filters?.status) params.set("status", filters.status);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [filters?.ownerId, filters?.caretakerId, filters?.status]);

  useEffect(() => {
    let cancelled = false;
    void reload;
    const fetchProperties = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/properties${query}`);
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setProperties(json.data);
          setError(null);
        } else {
          setError(json.error || "Failed to fetch properties");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchProperties();
    return () => {
      cancelled = true;
    };
  }, [query, reload]);

  const refetch = useCallback(() => setReload((n) => n + 1), []);

  return { properties, loading, error, refetch };
}

export function usePropertyMutations() {
  const [pending, setPending] = useState(false);

  const createProperty = async (input: PropertyInput): Promise<Property> => {
    setPending(true);
    try {
      const res = await fetch("/api/v1/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to create property");
      }
      return json.data as Property;
    } finally {
      setPending(false);
    }
  };

  const updateProperty = async (id: string, input: Partial<PropertyInput>): Promise<Property> => {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/properties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to update property");
      }
      return json.data as Property;
    } finally {
      setPending(false);
    }
  };

  const deleteProperty = async (id: string): Promise<void> => {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/properties/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to delete property");
      }
    } finally {
      setPending(false);
    }
  };

  return { createProperty, updateProperty, deleteProperty, pending };
}
