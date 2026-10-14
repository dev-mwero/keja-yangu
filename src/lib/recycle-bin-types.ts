/**
 * Client-safe recycle-bin type metadata. Kept free of model imports so both the
 * API layer (`@/lib/recycle-bin`) and browser components/hooks can share the
 * same type list and labels.
 */
export const RECYCLE_BIN_TYPES = [
  "property",
  "unit",
  "tenant",
  "lease",
  "invoice",
  "propertytype",
] as const;

export type RecycleBinType = (typeof RECYCLE_BIN_TYPES)[number];

export function isRecycleBinType(value: string): value is RecycleBinType {
  return (RECYCLE_BIN_TYPES as readonly string[]).includes(value);
}

export const RECYCLE_BIN_TYPE_LABELS: Record<RecycleBinType, string> = {
  property: "Properties",
  unit: "Units",
  tenant: "Tenants",
  lease: "Leases",
  invoice: "Invoices",
  propertytype: "Property types",
};
