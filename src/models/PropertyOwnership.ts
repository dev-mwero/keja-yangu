import { type InferSchemaType, model, models, Schema } from "mongoose";
import { OWNERSHIP_HOLDER_TYPES, OWNERSHIP_STATUSES } from "@/lib/domain-enums";

export type { OwnershipHolderType, OwnershipStatus } from "@/lib/domain-enums";
export { OWNERSHIP_HOLDER_TYPES, OWNERSHIP_STATUSES };

const propertyOwnershipSchema = new Schema(
  {
    propertyId: { type: String, required: true },
    holderType: { type: String, enum: [...OWNERSHIP_HOLDER_TYPES], required: true },
    holderUserId: { type: String, default: "" },
    legalName: { type: String, default: "" },
    shareBps: { type: Number, required: true, min: 1, max: 10000 },
    isPrimaryPayee: { type: Boolean, default: false },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date, default: null },
    status: { type: String, enum: [...OWNERSHIP_STATUSES], default: "active" },
    evidenceDocumentId: { type: String, default: "" },
    createdByUserId: { type: String, required: true },
    legacyOwnerId: { type: String, default: "" },
  },
  { timestamps: true },
);

propertyOwnershipSchema.index({ propertyId: 1, status: 1 });
propertyOwnershipSchema.index({ holderUserId: 1, status: 1 });

export type PropertyOwnershipDocument = InferSchemaType<typeof propertyOwnershipSchema>;

export const PropertyOwnership =
  models.PropertyOwnership ||
  model<PropertyOwnershipDocument>("PropertyOwnership", propertyOwnershipSchema);
