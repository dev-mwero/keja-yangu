export const PROPERTY_TYPES = ["apartment", "villa", "bungalow"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  apartment: "Apartment",
  villa: "Villa",
  bungalow: "Bungalow",
};

export const PROPERTY_STATUSES = ["available", "occupied", "maintenance"] as const;
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export const PROPERTY_STATUS_LABELS: Record<PropertyStatus, string> = {
  available: "Available",
  occupied: "Occupied",
  maintenance: "Maintenance",
};
