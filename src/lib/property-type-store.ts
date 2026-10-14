import { connectToDatabase } from "@/lib/mongoose";
import {
  type PropertyTypeOption,
  SEED_PROPERTY_TYPES,
  slugifyPropertyTypeKey,
} from "@/lib/property-types";
import { PropertyTypeModel } from "@/models/PropertyType";

const CACHE_TTL_MS = 30_000;

interface RawPropertyType {
  _id: unknown;
  key: string;
  label: string;
  order?: number;
  active?: boolean;
}

let cache: { at: number; values: PropertyTypeOption[] } | null = null;

function serialize(doc: RawPropertyType): PropertyTypeOption {
  return {
    id: String(doc._id),
    key: doc.key,
    label: doc.label,
    order: doc.order ?? 0,
    active: doc.active ?? true,
  };
}

export class PropertyTypeError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "PropertyTypeError";
    this.status = status;
  }
}

export function invalidatePropertyTypeCache(): void {
  cache = null;
}

/**
 * Seed the built-in taxonomy the first time the collection is read. Idempotent
 * and safe under concurrency (upserts keyed on `key`).
 */
export async function ensureSeeded(): Promise<void> {
  await connectToDatabase();
  const existing = await PropertyTypeModel.exists({});
  if (existing) return;
  await PropertyTypeModel.bulkWrite(
    SEED_PROPERTY_TYPES.map((type) => ({
      updateOne: {
        filter: { key: type.key },
        update: {
          $setOnInsert: { key: type.key, label: type.label, order: type.order, active: true },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

export async function listPropertyTypes(opts?: {
  includeInactive?: boolean;
  force?: boolean;
}): Promise<PropertyTypeOption[]> {
  const includeInactive = opts?.includeInactive ?? false;
  if (!opts?.force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return includeInactive ? cache.values : cache.values.filter((type) => type.active);
  }

  await connectToDatabase();
  await ensureSeeded();
  const docs = await PropertyTypeModel.find({ deletedAt: null })
    .sort({ order: 1, label: 1 })
    .lean();

  const values = docs.map((doc) => serialize(doc as unknown as RawPropertyType));
  cache = { at: Date.now(), values };
  return includeInactive ? values : values.filter((type) => type.active);
}

export async function getActivePropertyTypeKeys(): Promise<string[]> {
  return (await listPropertyTypes()).map((type) => type.key);
}

export async function isActivePropertyTypeKey(key: string): Promise<boolean> {
  const normalized = key.trim().toLowerCase();
  if (!normalized) return false;
  return (await getActivePropertyTypeKeys()).includes(normalized);
}

export async function createPropertyType(input: {
  label: string;
  key?: string;
}): Promise<PropertyTypeOption> {
  await connectToDatabase();
  await ensureSeeded();

  const label = input.label.trim();
  const key = slugifyPropertyTypeKey(input.key?.trim() || label);
  if (!key) {
    throw new PropertyTypeError("A property type needs a name with letters or numbers");
  }

  const existing = await PropertyTypeModel.findOne({ key }).lean();
  if (existing) {
    throw new PropertyTypeError(`A property type named "${label}" already exists`, 409);
  }

  const last = await PropertyTypeModel.findOne().sort({ order: -1 }).select("order").lean();
  const nextOrder = (last?.order ?? -1) + 1;

  const created = await PropertyTypeModel.create({ key, label, order: nextOrder, active: true });
  invalidatePropertyTypeCache();
  return serialize(created as unknown as RawPropertyType);
}

export async function updatePropertyType(
  id: string,
  input: { label?: string; order?: number; active?: boolean },
): Promise<PropertyTypeOption | null> {
  await connectToDatabase();
  const doc = await PropertyTypeModel.findOne({ _id: id, deletedAt: null });
  if (!doc) return null;

  if (typeof input.label === "string") {
    const label = input.label.trim();
    if (!label) throw new PropertyTypeError("A property type needs a name");
    doc.label = label;
  }
  if (typeof input.order === "number") {
    doc.order = input.order;
  }
  if (typeof input.active === "boolean") {
    doc.active = input.active;
  }

  await doc.save();
  invalidatePropertyTypeCache();
  return serialize(doc as unknown as RawPropertyType);
}
