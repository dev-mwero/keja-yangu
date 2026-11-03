import { type InferSchemaType, model, models, Schema } from "mongoose";
import {
  BROKER_SCOPE_TYPES,
  COMMISSION_AGREEMENT_STATUSES,
  COMMISSION_BASES,
} from "@/lib/domain-enums";

export type {
  BrokerScopeType,
  CommissionAgreementStatus,
  CommissionBasis,
} from "@/lib/domain-enums";
export { BROKER_SCOPE_TYPES, COMMISSION_AGREEMENT_STATUSES, COMMISSION_BASES };

const commissionAgreementSchema = new Schema(
  {
    brokerId: { type: String, required: true, trim: true },
    scopeType: {
      type: String,
      enum: [...BROKER_SCOPE_TYPES],
      required: true,
    },
    scopeId: { type: String, required: true, trim: true },
    propertyId: { type: String, required: true, trim: true },
    basis: {
      type: String,
      enum: [...COMMISSION_BASES],
      default: "first_month_rent",
    },
    rateBps: { type: Number, default: 0, min: 0, max: 10000 },
    fixedAmountMinor: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "KES", trim: true },
    status: {
      type: String,
      enum: [...COMMISSION_AGREEMENT_STATUSES],
      default: "draft",
    },
    payerBillingAccountId: { type: String, default: "", trim: true },
    termsAcceptedByBrokerAt: { type: Date, default: null },
    createdByUserId: { type: String, required: true, trim: true },
    terminatedByUserId: { type: String, default: "" },
    terminatedAt: { type: Date, default: null },
    terminationReason: { type: String, default: "" },
  },
  { timestamps: true },
);

commissionAgreementSchema.index(
  { brokerId: 1, scopeType: 1, scopeId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "active" },
  },
);

commissionAgreementSchema.index({ brokerId: 1, status: 1 });
commissionAgreementSchema.index({ propertyId: 1, status: 1 });

export type CommissionAgreementDocument = InferSchemaType<typeof commissionAgreementSchema>;

export const CommissionAgreement =
  models.CommissionAgreement ||
  model<CommissionAgreementDocument>("CommissionAgreement", commissionAgreementSchema);
