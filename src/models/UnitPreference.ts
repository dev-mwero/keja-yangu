import { type InferSchemaType, model, models, Schema } from "mongoose";
import { softDeletePlugin } from "@/lib/mongoose-soft-delete";

/**
 * A tenant's preferred unit within a property. A tenant picks a vacant unit
 * (e.g. ahead of a move-in), and a manager can read the preference alongside
 * the unit. At most one live preference per tenant per property — choosing a
 * different unit replaces the previous one.
 *
 * `ownerId`/`blockName`/`floorLabel` are denormalized so dashboards can list
 * preferences without joining `Property`/`Unit`.
 */
const unitPreferenceSchema = new Schema(
  {
    userId: { type: String, required: true },
    propertyId: { type: String, required: true },
    ownerId: { type: String, required: true },
    unitId: { type: String, required: true },
    blockId: { type: String, default: "" },
    blockName: { type: String, default: "" },
    floorId: { type: String, default: "" },
    floorLabel: { type: String, default: "" },
    note: { type: String, default: "", maxlength: 500 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

unitPreferenceSchema.index({ userId: 1, propertyId: 1 });
unitPreferenceSchema.index({ unitId: 1 });
unitPreferenceSchema.index({ ownerId: 1 });
// At most one live preference per tenant per property.
unitPreferenceSchema.index(
  { userId: 1, propertyId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
softDeletePlugin(unitPreferenceSchema);

export type UnitPreferenceDocument = InferSchemaType<typeof unitPreferenceSchema>;

export const UnitPreference =
  models.UnitPreference || model("UnitPreference", unitPreferenceSchema);
