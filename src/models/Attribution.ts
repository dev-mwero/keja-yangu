import { type InferSchemaType, model, models, Schema } from "mongoose";
import { ATTRIBUTION_SOURCES, ATTRIBUTION_STATUSES } from "@/lib/domain-enums";

export type { AttributionSource, AttributionStatus } from "@/lib/domain-enums";
export { ATTRIBUTION_SOURCES, ATTRIBUTION_STATUSES };

const attributionSchema = new Schema(
  {
    applicationId: { type: String, trim: true, default: "" },
    leaseId: { type: String, trim: true, default: "" },
    unitId: { type: String, required: true, trim: true },
    propertyId: { type: String, required: true, trim: true },
    listingId: { type: String, trim: true, default: "" },
    publisherId: { type: String, trim: true, default: "" },
    publisherUserId: { type: String, trim: true, default: "" },
    brokerUserId: { type: String, trim: true, default: "" },
    commissionAgreementId: { type: String, trim: true, default: "" },
    shareCode: { type: String, trim: true, default: "" },
    touchToken: { type: String, trim: true, default: "" },
    touchExpiresAt: { type: Date, default: null },
    source: {
      type: String,
      enum: [...ATTRIBUTION_SOURCES],
      default: "direct",
    },
    status: {
      type: String,
      enum: [...ATTRIBUTION_STATUSES],
      default: "provisional",
    },
    touchTimestamp: { type: Date, default: () => new Date() },
    lockedAt: { type: Date, default: null },
    confirmedAt: { type: Date, default: null },
    reversedAt: { type: Date, default: null },
    reversalReason: { type: String, default: "" },
    supersededByAttributionId: { type: String, default: "" },
    disputeReason: { type: String, default: "" },
    disputedByUserId: { type: String, default: "" },
    disputeResolvedAt: { type: Date, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

attributionSchema.index(
  { leaseId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: "confirmed",
      leaseId: { $gt: "" },
    },
  },
);

attributionSchema.index(
  { applicationId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["provisional", "locked"] },
      applicationId: { $gt: "" },
    },
  },
);

attributionSchema.index(
  { touchToken: 1 },
  {
    unique: true,
    partialFilterExpression: {
      touchToken: { $gt: "" },
    },
  },
);

// Provisional touches expire; locked/confirmed records have touchExpiresAt null.
attributionSchema.index(
  { touchExpiresAt: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: { status: "provisional" },
  },
);

attributionSchema.index({ brokerUserId: 1, status: 1 });
attributionSchema.index({ unitId: 1, status: 1 });
attributionSchema.index({ propertyId: 1, status: 1 });

export type AttributionDocument = InferSchemaType<typeof attributionSchema>;

export const Attribution =
  models.Attribution || model<AttributionDocument>("Attribution", attributionSchema);
