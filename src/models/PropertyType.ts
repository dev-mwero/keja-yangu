import { type InferSchemaType, model, models, Schema } from "mongoose";
import { softDeletePlugin } from "@/lib/mongoose-soft-delete";

/**
 * A single entry in the platform-wide property taxonomy. Records reference a
 * type by its stable `key`; renaming only changes `label`. Types are never hard
 * deleted — they are deactivated so historical properties keep resolving.
 */
const propertyTypeSchema = new Schema(
  {
    key: { type: String, required: true, trim: true, lowercase: true },
    label: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    // Set when the type is soft-deleted (hidden from reads, restorable).
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

propertyTypeSchema.index({ active: 1, order: 1 });
// Keys are unique among live types only; a soft-deleted key can be reused.
propertyTypeSchema.index(
  { key: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
softDeletePlugin(propertyTypeSchema);

export type PropertyTypeDocument = InferSchemaType<typeof propertyTypeSchema>;

export const PropertyTypeModel =
  models.PropertyType || model<PropertyTypeDocument>("PropertyType", propertyTypeSchema);
