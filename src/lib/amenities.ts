export interface AmenityOption {
  id: string;
  label: string;
  category: string;
}

/**
 * Precreated amenity options users can pick from. A custom amenity is still
 * allowed when the desired one is not listed.
 */
export const AMENITY_OPTIONS: AmenityOption[] = [
  { id: "swimming_pool", label: "Swimming Pool", category: "Recreation" },
  { id: "basketball_court", label: "Basketball Court", category: "Recreation" },
  { id: "gym", label: "Gym", category: "Recreation" },
  { id: "garden", label: "Garden", category: "Outdoor" },
  { id: "playground", label: "Children's Playground", category: "Outdoor" },
  { id: "bbq_area", label: "BBQ Area", category: "Outdoor" },
  { id: "parking", label: "Parking", category: "Convenience" },
  { id: "lift", label: "Lift / Elevator", category: "Convenience" },
  { id: "backup_power", label: "Backup Power", category: "Utilities" },
  { id: "backup_water", label: "Backup Water", category: "Utilities" },
  { id: "wifi", label: "Wi-Fi", category: "Utilities" },
  { id: "security_24_7", label: "Security 24/7", category: "Security" },
  { id: "cctv", label: "CCTV", category: "Security" },
  { id: "gated_community", label: "Gated Community", category: "Security" },
  { id: "concierge", label: "Concierge", category: "Services" },
  { id: "balcony", label: "Balcony", category: "Unit" },
  { id: "furnished", label: "Furnished", category: "Unit" },
  { id: "pet_friendly", label: "Pet Friendly", category: "Unit" },
];

export const AMENITY_LABELS: string[] = AMENITY_OPTIONS.map((a) => a.label);

/**
 * Normalize a list of amenity strings: trim, drop blanks, de-duplicate
 * case-insensitively (keeping the first-seen casing/order).
 */
export function normalizeAmenities(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const label = raw.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}
