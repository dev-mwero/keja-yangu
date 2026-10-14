/**
 * Property type keys. Historically these were a closed set, but the taxonomy is
 * now managed by the system administrator (see the `PropertyType` model and
 * `lib/property-type-store`). These three remain the built-in defaults that are
 * seeded into a fresh database.
 */
export const PROPERTY_TYPES = ["apartment", "villa", "bungalow"] as const;

export type BuiltinPropertyType = (typeof PROPERTY_TYPES)[number];

/**
 * A property type key. Built-in keys are known statically (for autocomplete),
 * but administrators can add more, so any non-empty string is accepted.
 */
export type PropertyType = BuiltinPropertyType | (string & {});

export const PROPERTY_TYPE_LABELS: Record<BuiltinPropertyType, string> = {
  apartment: "Apartment",
  villa: "Villa",
  bungalow: "Bungalow",
};

export interface PropertyTypeOption {
  id: string;
  key: string;
  label: string;
  order: number;
  active: boolean;
}

export interface SeedPropertyType {
  key: BuiltinPropertyType;
  label: string;
  order: number;
}

/** Default taxonomy seeded into an empty database. */
export const SEED_PROPERTY_TYPES: SeedPropertyType[] = [
  { key: "apartment", label: "Apartment", order: 0 },
  { key: "villa", label: "Villa", order: 1 },
  { key: "bungalow", label: "Bungalow", order: 2 },
];

/**
 * Turn a human label into a stable, URL-safe key, e.g. "Town House" ->
 * "town-house". Returns an empty string when the label has no usable
 * characters.
 */
export function slugifyPropertyTypeKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Resolve a display label for a key, preferring an explicitly supplied map
 * (e.g. fetched from the API) and falling back to the built-in labels/the raw
 * key for unknown values.
 */
export function propertyTypeLabel(
  key: string,
  labels?: Record<string, string> | ReadonlyMap<string, string>,
): string {
  if (labels) {
    if (typeof (labels as ReadonlyMap<string, string>).get === "function") {
      const found = (labels as ReadonlyMap<string, string>).get(key);
      if (found) return found;
    } else {
      const found = (labels as Record<string, string>)[key];
      if (found) return found;
    }
  }
  return PROPERTY_TYPE_LABELS[key as BuiltinPropertyType] ?? key;
}

export const PROPERTY_STATUSES = ["available", "occupied", "maintenance"] as const;
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export const PROPERTY_STATUS_LABELS: Record<PropertyStatus, string> = {
  available: "Available",
  occupied: "Occupied",
  maintenance: "Maintenance",
};
