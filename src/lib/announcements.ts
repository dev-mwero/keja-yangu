/**
 * Copies an announcement doc and appends the fields the tenant page renders:
 * `author` is the denormalized author name and `property` is the property
 * title, falling back to "All properties" for portfolio-wide postings.
 */
export function serializeAnnouncement<
  T extends { _id: unknown; authorName: string; propertyId: string },
>(doc: T, titles?: Map<string, string>): T & { _id: string; author: string; property: string } {
  return {
    ...doc,
    _id: String(doc._id),
    author: doc.authorName,
    property: (doc.propertyId && titles?.get(doc.propertyId)) || "All properties",
  };
}
