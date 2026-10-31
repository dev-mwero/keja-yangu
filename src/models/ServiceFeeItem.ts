import { type InferSchemaType, model, models, Schema } from "mongoose";

export const SERVICE_FEE_APPLIES_TO = ["all", "selected"] as const;
export type ServiceFeeAppliesTo = (typeof SERVICE_FEE_APPLIES_TO)[number];

/**
 * A reusable monthly service-fee item defined on a property (water, security,
 * garbage, ...). Units inherit every item that applies to them; a per-unit
 * override can change the amount or switch the item off for one unit.
 */
const serviceFeeItemSchema = new Schema(
  {
    ownerId: { type: String, required: true },
    propertyId: { type: String, required: true },
    label: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0, default: 0 },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    appliesTo: { type: String, enum: [...SERVICE_FEE_APPLIES_TO], default: "all" },
    unitIds: { type: [String], default: [] },
  },
  { timestamps: true },
);

serviceFeeItemSchema.index({ propertyId: 1, active: 1, sortOrder: 1 });
serviceFeeItemSchema.index({ ownerId: 1 });
serviceFeeItemSchema.index({ unitIds: 1 });

export type ServiceFeeItemDocument = InferSchemaType<typeof serviceFeeItemSchema>;

export const ServiceFeeItem =
  models.ServiceFeeItem || model<ServiceFeeItemDocument>("ServiceFeeItem", serviceFeeItemSchema);
