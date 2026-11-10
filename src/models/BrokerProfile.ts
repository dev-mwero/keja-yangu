import mongoose, { type InferSchemaType, model, Schema } from "mongoose";
import { BROKER_PROFILE_STATUSES } from "@/lib/domain-enums";

export type { BrokerProfileStatus } from "@/lib/domain-enums";
export { BROKER_PROFILE_STATUSES };

const brokerProfileSchema = new Schema(
  {
    userId: { type: String, required: true, trim: true },
    agencyName: { type: String, trim: true, default: "" },
    licenseNumber: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, required: true },
    email: { type: String, trim: true, lowercase: true, required: true },
    counties: { type: [String], default: [] },
    specialties: { type: [String], default: [] },
    status: {
      type: String,
      enum: [...BROKER_PROFILE_STATUSES],
      default: "pending",
    },
    payoutMethod: {
      payoutType: {
        type: String,
        enum: ["mpesa", "bank", "none"],
        default: "none",
      },
      accountName: { type: String, trim: true, default: "" },
      accountNumber: { type: String, trim: true, default: "" },
      bankName: { type: String, trim: true, default: "" },
    },
    verifiedByUserId: { type: String, default: "" },
    verifiedAt: { type: Date, default: null },
    verificationNotes: { type: String, default: "" },
    suspendedByUserId: { type: String, default: "" },
    suspendedAt: { type: Date, default: null },
    suspensionReason: { type: String, default: "" },
  },
  { timestamps: true },
);

brokerProfileSchema.index({ userId: 1 }, { unique: true });
brokerProfileSchema.index({ status: 1 });
brokerProfileSchema.index({ licenseNumber: 1 });

export type BrokerProfileDocument = InferSchemaType<typeof brokerProfileSchema>;

export const BrokerProfile =
  mongoose.models.BrokerProfile ||
  model<BrokerProfileDocument>("BrokerProfile", brokerProfileSchema);
