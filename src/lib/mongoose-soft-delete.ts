import type { Schema } from "mongoose";

/**
 * App-wide soft delete.
 *
 * Records are never physically removed by default: they are stamped with a
 * `deletedAt` timestamp. The plugin adds that field, hides deleted records from
 * reads by default, and exposes helpers to delete/restore.
 *
 * Default read exclusion is implemented as query middleware on the read hooks
 * (`find`, `findOne`, `findOneAndUpdate`, `findOneAndDelete`, `countDocuments`,
 * `exists`). A caller can opt back in to deleted records with
 * `.setOptions({ withDeleted: true })`.
 *
 * `{ deletedAt: null }` matches both `null` and a missing field, so no data
 * backfill is required for rows written before the field existed.
 */

export const SOFT_DELETE_FIELD = "deletedAt";

export interface SoftDeleteOptions {
  field?: string;
}

/** Minimal query surface the middleware needs; keeps the helper testable. */
export interface SoftDeleteQuery {
  getOptions?: () => { withDeleted?: boolean } | undefined;
  where: (filter: Record<string, unknown>) => unknown;
}

/** Whether a query has opted in to including soft-deleted records. */
export function includesDeleted(query: Pick<SoftDeleteQuery, "getOptions">): boolean {
  return Boolean(query.getOptions?.()?.withDeleted);
}

/** Adds the `deletedAt: null` guard unless the caller opted in. */
export function applySoftDeleteFilter(
  query: SoftDeleteQuery,
  field: string = SOFT_DELETE_FIELD,
): void {
  if (includesDeleted(query)) return;
  query.where({ [field]: null });
}

/** Read hooks that must exclude soft-deleted records by default. */
const READ_HOOKS = [
  "find",
  "findOne",
  "findOneAndUpdate",
  "findOneAndDelete",
  "countDocuments",
  "exists",
] as const;

export function softDeletePlugin(schema: Schema, options: SoftDeleteOptions = {}): void {
  const field = options.field ?? SOFT_DELETE_FIELD;

  if (!schema.path(field)) {
    schema.add({ [field]: { type: Date, default: null, index: true } });
  }

  // Mongoose 9 query middleware runs synchronously without a `next` callback.
  const exclude = function (this: SoftDeleteQuery) {
    applySoftDeleteFilter(this, field);
  };

  for (const hook of READ_HOOKS) {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic query-hook name.
    schema.pre(hook as any, exclude as any);
  }

  schema.methods.softDelete = function (when: Date = new Date()) {
    (this as Record<string, unknown>)[field] = when;
    return (this as unknown as { save: () => Promise<unknown> }).save();
  };

  schema.methods.restore = function () {
    (this as Record<string, unknown>)[field] = null;
    return (this as unknown as { save: () => Promise<unknown> }).save();
  };

  schema.statics.softDeleteById = function (id: unknown, when: Date = new Date()) {
    return this.updateOne({ _id: id }, { $set: { [field]: when } });
  };

  schema.statics.restoreById = function (id: unknown) {
    return this.updateOne({ _id: id, [field]: { $ne: null } }, { $set: { [field]: null } });
  };

  schema.statics.softDeleteMany = function (filter: Record<string, unknown>, when = new Date()) {
    return this.updateMany({ ...filter, [field]: null }, { $set: { [field]: when } });
  };
}

/**
 * Structural type of the statics the plugin adds. Mongoose does not propagate
 * `schema.statics` into the model's TS type, so call sites opt in explicitly:
 * `asSoftDeleteModel(Unit).softDeleteById(id)`.
 */
export interface SoftDeleteModel {
  softDeleteById(id: unknown, when?: Date): Promise<unknown>;
  restoreById(id: unknown): Promise<unknown>;
  softDeleteMany(filter: Record<string, unknown>, when?: Date): Promise<unknown>;
}

export function asSoftDeleteModel<T>(model: T): T & SoftDeleteModel {
  return model as T & SoftDeleteModel;
}
