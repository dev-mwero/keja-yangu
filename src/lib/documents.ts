/**
 * Copies a document doc and appends the fields the tenant page renders:
 * `size` maps from `sizeLabel`, `uploadedBy` from `uploadedByName`, and
 * `uploadedAt` is the creation time as an ISO string.
 */
export function serializeDocument<
  T extends {
    _id: unknown;
    propertyId: string;
    sizeLabel: string;
    uploadedByName: string;
    createdAt?: Date;
  },
>(
  doc: T,
  titles?: Map<string, string>,
): T & { _id: string; size: string; uploadedBy: string; uploadedAt: string; property: string } {
  return {
    ...doc,
    _id: String(doc._id),
    size: doc.sizeLabel,
    uploadedBy: doc.uploadedByName,
    uploadedAt: new Date(doc.createdAt ?? new Date()).toISOString(),
    property: titles?.get(doc.propertyId) ?? "",
  };
}
