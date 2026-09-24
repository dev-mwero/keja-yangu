/**
 * Copies a complaint doc and appends the property title the tenant pages
 * render. Missing titles serialize as an empty string (the pages fall back to
 * a dash-safe layout and staff views resolve every pinned property via the
 * batched title map).
 */
export function serializeComplaint<T extends { propertyId: string }>(
  doc: T,
  titles?: Map<string, string>,
): T & { property: string } {
  return { ...doc, property: titles?.get(doc.propertyId) ?? "" };
}
