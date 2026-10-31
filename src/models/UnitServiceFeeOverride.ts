import { type InferSchemaType, model, models, Schema } from "mongoose";

/**
 * Per-unit deviation from a property's service-fee template. A missing row
 * means the unit inherits the template amount/active flag exactly. Setting
 * `amount` changes the amount for that unit; `active: false` removes the item
 * from that unit without deleting the shared template item.
 */
const unitServiceFeeOverrideSchema = new Schema(
  {
    ownerId: { type: String, required: true },
    propertyId: { type: String, required: true },
    itemId: { type: String, required: true },
    unitId: { type: String, required: true },
    amount: { type: Number, min: 0, default: null },
    active: { type: Boolean, default: null },
  },
  { timestamps: true },
);

unitServiceFeeOverrideSchema.index({ itemId: 1, unitId: 1 }, { unique: true });
unitServiceFeeOverrideSchema.index({ unitId: 1 });
unitServiceFeeOverrideSchema.index({ propertyId: 1, unitId: 1 });

export type UnitServiceFeeOverrideDocument = InferSchemaType<
  typeof unitServiceFeeOverrideSchema
>;

export const UnitServiceFeeOverride =
  models.UnitServiceFeeOverride ||
  model<UnitServiceFeeOverrideDocument>(
    "UnitServiceFeeOverride",
    unitServiceFeeOverrideSchema,
  );
