import mongoose, { type InferSchemaType, model, Schema } from "mongoose";
import { PERIOD_REGEX } from "@/lib/invoicing";

export interface IPaymentSplit {
  paymentId: string;
  invoiceId: string;
  unitId: string;
  propertyId: string;
  ownerId: string;
  billingAccountId?: string;
  period: string;
  rentMinor: number;
  serviceChargeMinor: number;
  createdAt?: Date;
}

const paymentSplitSchema = new Schema<IPaymentSplit>(
  {
    paymentId: { type: String, required: true },
    invoiceId: { type: String, required: true },
    unitId: { type: String, required: true },
    propertyId: { type: String, required: true },
    ownerId: { type: String, required: true },
    billingAccountId: { type: String, default: "" },
    period: { type: String, required: true, match: PERIOD_REGEX },
    rentMinor: { type: Number, required: true, min: 0 },
    serviceChargeMinor: { type: Number, required: true, min: 0 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

// One split record per settled payment.
paymentSplitSchema.index({ paymentId: 1 }, { unique: true });
paymentSplitSchema.index({ invoiceId: 1 });
paymentSplitSchema.index({ ownerId: 1, period: 1 });

export type PaymentSplitDocument = InferSchemaType<IPaymentSplit>;

export const PaymentSplit =
  mongoose.models.PaymentSplit || model<IPaymentSplit>("PaymentSplit", paymentSplitSchema);
