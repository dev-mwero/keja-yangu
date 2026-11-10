import mongoose, { type InferSchemaType, model, Schema } from "mongoose";
import { PROPERTY_CLAIM_STATUSES } from "@/lib/domain-enums";

export type { PropertyClaimStatus } from "@/lib/domain-enums";
export { PROPERTY_CLAIM_STATUSES };

const propertyClaimSchema = new Schema(
  {
    propertyId: { type: String, required: true },
    claimantUserId: { type: String, required: true },
    evidence: { type: String, default: "" },
    status: { type: String, enum: [...PROPERTY_CLAIM_STATUSES], default: "pending" },
    reviewedByUserId: { type: String, default: "" },
    reviewedAt: { type: Date, default: null },
    decisionNote: { type: String, default: "" },
  },
  { timestamps: true },
);

propertyClaimSchema.index({ propertyId: 1, status: 1 });
propertyClaimSchema.index({ claimantUserId: 1, status: 1 });

export type PropertyClaimDocument = InferSchemaType<typeof propertyClaimSchema>;

export const PropertyClaim =
  mongoose.models.PropertyClaim ||
  model<PropertyClaimDocument>("PropertyClaim", propertyClaimSchema);
