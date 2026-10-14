import { SOFT_DELETE_FIELD } from "@/lib/mongoose-soft-delete";
import { isRecycleBinType, RECYCLE_BIN_TYPES, type RecycleBinType } from "@/lib/recycle-bin-types";
import { Invoice } from "@/models/Invoice";
import { Lease } from "@/models/Lease";
import { Property } from "@/models/Property";
import { PropertyTypeModel } from "@/models/PropertyType";
import { Tenant } from "@/models/Tenant";
import { Unit } from "@/models/Unit";

/**
 * Recycle-bin operations for soft-deleted records (system-admin only).
 *
 * Reads opt in to deleted records with `setOptions({ withDeleted: true })` (the
 * plugin otherwise strips them) and filter on `deletedAt != null`, so only
 * deleted rows are returned. Restore flips `deletedAt` back to `null`; purge
 * hard-deletes and is restricted to already soft-deleted records.
 *
 * Restoring or purging a property also applies to its soft-deleted units, the
 * inverse of the property delete cascade.
 */
export { isRecycleBinType, RECYCLE_BIN_TYPES, type RecycleBinType };

interface SoftDeleteQueryOptions {
  withDeleted?: boolean;
}

interface DeletedListQuery {
  setOptions(options: SoftDeleteQueryOptions): DeletedListQuery;
  sort(order: Record<string, 1 | -1>): DeletedListQuery;
  skip(offset: number): DeletedListQuery;
  limit(size: number): DeletedListQuery;
  lean(): Promise<unknown[]>;
}

interface DeletedCountQuery {
  setOptions(options: SoftDeleteQueryOptions): Promise<number>;
}

/** The subset of the Mongoose model surface the recycle bin uses. */
interface RecycleBinModel {
  find(filter: Record<string, unknown>): DeletedListQuery;
  countDocuments(filter: Record<string, unknown>): DeletedCountQuery;
  deleteOne(filter: Record<string, unknown>): Promise<{ deletedCount?: number }>;
  deleteMany(filter: Record<string, unknown>): Promise<unknown>;
  updateMany(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<unknown>;
  restoreById(id: unknown): Promise<{ matchedCount?: number }>;
}

interface RecycleBinEntry {
  label: string;
  model: RecycleBinModel;
}

const registry: Record<RecycleBinType, RecycleBinEntry> = {
  property: { label: "Property", model: Property as unknown as RecycleBinModel },
  unit: { label: "Unit", model: Unit as unknown as RecycleBinModel },
  tenant: { label: "Tenant", model: Tenant as unknown as RecycleBinModel },
  lease: { label: "Lease", model: Lease as unknown as RecycleBinModel },
  invoice: { label: "Invoice", model: Invoice as unknown as RecycleBinModel },
  propertytype: { label: "Property type", model: PropertyTypeModel as unknown as RecycleBinModel },
};

const DELETED_FILTER = { [SOFT_DELETE_FIELD]: { $ne: null } } as const;

/** Counts soft-deleted records per type, for the recycle-bin overview. */
export async function countDeleted(): Promise<Record<RecycleBinType, number>> {
  const entries = await Promise.all(
    RECYCLE_BIN_TYPES.map(async (type) => {
      const total = await registry[type].model
        .countDocuments({ ...DELETED_FILTER })
        .setOptions({ withDeleted: true });
      return [type, total] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<RecycleBinType, number>;
}

/** Paginated list of soft-deleted records of one type, most recently deleted first. */
export async function listDeleted(type: RecycleBinType, page: number, limit: number) {
  const { model } = registry[type];
  const skip = (page - 1) * limit;
  const docs = await model
    .find({ ...DELETED_FILTER })
    .setOptions({ withDeleted: true })
    .sort({ [SOFT_DELETE_FIELD]: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
  const total = await model.countDocuments({ ...DELETED_FILTER }).setOptions({ withDeleted: true });
  return { docs, total };
}

/**
 * Restores a soft-deleted record. Restoring a property also restores its
 * soft-deleted units, mirroring the delete cascade. Returns `false` when no
 * soft-deleted record matched.
 */
export async function restoreDeleted(type: RecycleBinType, id: string): Promise<boolean> {
  const result = await registry[type].model.restoreById(id);
  if ((result?.matchedCount ?? 0) === 0) return false;

  if (type === "property") {
    await registry.unit.model.updateMany(
      { propertyId: id, ...DELETED_FILTER },
      { $set: { [SOFT_DELETE_FIELD]: null } },
    );
  }
  return true;
}

/**
 * Permanently removes a soft-deleted record. Only records that are already
 * soft-deleted can be purged. Purging a property also purges its soft-deleted
 * units so they cannot be orphaned. Returns `false` when nothing matched.
 */
export async function purgeDeleted(type: RecycleBinType, id: string): Promise<boolean> {
  const { deletedCount } = await registry[type].model.deleteOne({ _id: id, ...DELETED_FILTER });
  if ((deletedCount ?? 0) === 0) return false;

  if (type === "property") {
    await registry.unit.model.deleteMany({ propertyId: id, ...DELETED_FILTER });
  }
  return true;
}
