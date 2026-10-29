"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PropertyPurpose } from "@/lib/domain-enums";
import type { PropertyStatus, PropertyType } from "@/lib/property-types";

export type { PropertyPurpose, PropertyStatus };

export interface PropertyFloor {
  _id: string;
  level: number;
  label: string;
  unitsPerFloor: number;
  rentOverride: number | null;
  purpose?: PropertyPurpose | null;
}

export interface PropertyBlock {
  _id: string;
  name: string;
  order: number;
  rentOverride: number | null;
  purpose?: PropertyPurpose | null;
  floors: PropertyFloor[];
}

export interface FloorInputPayload {
  /** Existing floor subdocument id (present when editing a saved structure). */
  id?: string;
  level: number;
  label?: string;
  rentOverride?: number | null;
  purpose?: PropertyPurpose | null;
  unitsPerFloor: number;
  unitNames?: string[];
}

export interface BlockInputPayload {
  /** Existing block subdocument id (present when editing a saved structure). */
  id?: string;
  name: string;
  rentOverride?: number | null;
  purpose?: PropertyPurpose | null;
  floors: FloorInputPayload[];
}

/**
 * Convert a saved property's blocks into editor payloads, preserving the
 * block/floor subdocument ids so a save reconciles in place instead of
 * recreating units.
 */
export function toBlockPayloads(property: Pick<Property, "blocks">): BlockInputPayload[] {
  return (property.blocks ?? []).map((block) => ({
    id: block._id,
    name: block.name,
    rentOverride: block.rentOverride,
    purpose: block.purpose,
    floors: block.floors.map((floor) => ({
      id: floor._id,
      level: floor.level,
      label: floor.label,
      rentOverride: floor.rentOverride,
      purpose: floor.purpose,
      unitsPerFloor: floor.unitsPerFloor,
    })),
  }));
}

export interface Property {
  _id: string;
  title: string;
  type: PropertyType;
  location: string;
  price: number;
  description: string;
  images: string[];
  amenities: string[];
  status: PropertyStatus;
  dateCompleted?: string | null;
  purpose?: PropertyPurpose;
  ownerId: string;
  caretakerIds: string[];
  beds: number;
  baths: number;
  area: number;
  published: boolean;
  blocks: PropertyBlock[];
}

export interface PropertyInput {
  title: string;
  type: PropertyType;
  location: string;
  price: number;
  description?: string;
  images?: string[];
  amenities?: string[];
  status?: PropertyStatus;
  dateCompleted?: string | null;
  purpose?: PropertyPurpose;
  beds?: number;
  baths?: number;
  area?: number;
  caretakerIds?: string[];
  targetOwnerId?: string;
  published?: boolean;
  blocks?: BlockInputPayload[];
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

  useEffect(() => {
    const onFocus = () => setReload((n) => n + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const refetch = useCallback(() => setReload((n) => n + 1), []);

  return { properties, loading, error, refetch };
}

export interface PropertyUnit {
  _id: string;
  name: string;
  letter?: string;
  floorLevel: number;
  floorLabel?: string;
  blockName: string;
  rent: number | null;
  beds: number;
  baths: number;
  area: number;
  status: string;
}

export interface PropertyDetail extends Property {
  units: PropertyUnit[];
}

/**
 * Fetches a single property together with its vacant units for the public
 * property page. Unit details are loaded separately when a user expands the
 * unit list; the initial property response stays compact.
 */
export function useProperty(id?: string) {
  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!id) {
      setProperty(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    void reload;
    const fetchProperty = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/properties/${id}?includeUnits=0`);
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setProperty(json.data as PropertyDetail);
          setError(null);
        } else {
          setProperty(null);
          setError(json.error || "Failed to fetch property");
        }
      } catch (err) {
        if (!cancelled) {
          setProperty(null);
          setError(err instanceof Error ? err.message : "Network error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchProperty();
    return () => {
      cancelled = true;
    };
  }, [id, reload]);

  const refetch = useCallback(() => setReload((n) => n + 1), []);
  const units = property?.units ?? [];

  return { property, units, loading, error, refetch };
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

  const updateStructure = async (id: string, blocks: BlockInputPayload[]): Promise<Property> => {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/properties/${id}/structure`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to update property structure");
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

  return { createProperty, updateProperty, updateStructure, deleteProperty, pending };
}
