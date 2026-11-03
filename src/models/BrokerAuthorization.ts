import { type InferSchemaType, model, models, Schema } from "mongoose";
import { BROKER_AUTH_STATUSES, BROKER_SCOPE_TYPES } from "@/lib/domain-enums";

export type { BrokerAuthStatus, BrokerScopeType } from "@/lib/domain-enums";
export { BROKER_AUTH_STATUSES, BROKER_SCOPE_TYPES };

const brokerAuthorizationSchema = new Schema(
  {
    brokerId: { type: String, required: true, trim: true },
    scopeType: {
      type: String,
      enum: [...BROKER_SCOPE_TYPES],
      required: true,
    },
    scopeId: { type: String, required: true, trim: true },
    propertyId: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: [...BROKER_AUTH_STATUSES],
      default: "active",
    },
    grantedByUserId: { type: String, required: true, trim: true },
    grantedAt: { type: Date, default: () => new Date() },
    validFrom: { type: Date, default: () => new Date() },
    validTo: { type: Date, default: null },
    notes: { type: String, default: "" },
    revokedByUserId: { type: String, default: "" },
    revokedAt: { type: Date, default: null },
    revocationReason: { type: String, default: "" },
  },
  { timestamps: true },
);

brokerAuthorizationSchema.index(
  { brokerId: 1, scopeType: 1, scopeId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "active" },
  },
);

brokerAuthorizationSchema.index({ brokerId: 1, status: 1 });
brokerAuthorizationSchema.index({ propertyId: 1, status: 1 });

export type BrokerAuthorizationDocument = InferSchemaType<typeof brokerAuthorizationSchema>;

export const BrokerAuthorization =
  models.BrokerAuthorization ||
  model<BrokerAuthorizationDocument>("BrokerAuthorization", brokerAuthorizationSchema);
