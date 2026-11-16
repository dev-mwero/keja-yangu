/**
 * Copies a task doc and appends the property title the task pages render.
 * Missing titles serialize as an empty string.
 */
export function serializeTask<T extends { propertyId?: string }>(
  doc: T,
  titles?: Map<string, string>,
): T & { property: string } {
  return {
    ...doc,
    property: (doc.propertyId && titles?.get(doc.propertyId)) || "",
  };
}
