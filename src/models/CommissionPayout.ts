import mongoose, { type InferSchemaType, model, Schema } from "mongoose";
import { COMMISSION_PAYOUT_STATUSES } from "@/lib/domain-enums";

export type { CommissionPayoutStatus } from "@/lib/domain-enums";
export { COMMISSION_PAYOUT_STATUSES };

const commissionPayoutSchema = new Schema(
  {
    batchCode: { type: String, required: true, trim: true },
    brokerUserId: { type: String, required: true, trim: true },
    accrualIds: { type: [String], default: [] },
    grossMinor: { type: Number, default: 0 },
    taxMinor: { type: Number, default: 0, min: 0 },
    netMinor: { type: Number, default: 0 },
    currency: { type: String, default: "KES", trim: true },
    status: {
      type: String,
      enum: [...COMMISSION_PAYOUT_STATUSES],
      default: "draft",
    },
    cutoffAt: { type: Date, default: () => new Date() },
    createdByUserId: { type: String, required: true, trim: true },
    approvedByUserId: { type: String, default: "", trim: true },
    executedByUserId: { type: String, default: "", trim: true },
    providerReference: { type: String, default: "", trim: true },
    failureReason: { type: String, default: "" },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true },
);

commissionPayoutSchema.index({ batchCode: 1 }, { unique: true });
commissionPayoutSchema.index({ brokerUserId: 1, status: 1 });
commissionPayoutSchema.index({ status: 1, createdAt: 1 });

export type CommissionPayoutDocument = InferSchemaType<typeof commissionPayoutSchema>;

export const CommissionPayout =
  mongoose.models.CommissionPayout ||
  model<CommissionPayoutDocument>("CommissionPayout", commissionPayoutSchema);
