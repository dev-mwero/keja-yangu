/**
 * Copies a complaint doc and appends the property title and unit name the
 * tenant pages render. Missing titles/names serialize as an empty string (the
 * pages fall back to a dash-safe layout and staff views resolve every pinned
 * property via the batched title map).
 */
export function serializeComplaint<T extends { propertyId: string; unitId?: string }>(
  doc: T,
  titles?: Map<string, string>,
  unitNames?: Map<string, string>,
): T & {
  property: string;
  unitName: string;
} {
  return {
    ...doc,
    property: titles?.get(doc.propertyId) ?? "",
    unitName: unitNames?.get(doc.unitId ?? "") ?? "",
  };
}
