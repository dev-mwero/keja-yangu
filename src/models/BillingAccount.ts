import { type InferSchemaType, model, models, Schema } from "mongoose";
import { BILLING_ACCOUNT_STATUSES } from "@/lib/domain-enums";
import { softDeletePlugin } from "@/lib/mongoose-soft-delete";

export type { BillingAccountStatus } from "@/lib/domain-enums";
export { BILLING_ACCOUNT_STATUSES };

export interface IBillingAccount {
  ownerAdminId: string;
  legalEntityName: string;
  legalOwnerRef?: string;
  invoicePrefix: string;
  invoiceCounters: Record<string, number>;
  defaultCurrency: string;
  paymentConfigId?: string;
  status: (typeof BILLING_ACCOUNT_STATUSES)[number];
  legacyOwnerId: string;
  deletedAt?: Date | null;
}

const billingAccountSchema = new Schema<IBillingAccount>(
  {
    ownerAdminId: { type: String, required: true },
    legalEntityName: { type: String, required: true, trim: true },
    legalOwnerRef: { type: String, default: "" },
    invoicePrefix: { type: String, required: true, trim: true, uppercase: true, default: "INV" },
    invoiceCounters: { type: Map, of: Number, default: () => new Map() },
    defaultCurrency: { type: String, default: "KES", uppercase: true },
    paymentConfigId: { type: String, default: "" },
    status: { type: String, enum: [...BILLING_ACCOUNT_STATUSES], default: "active" },
    legacyOwnerId: { type: String, default: "" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

billingAccountSchema.index({ ownerAdminId: 1, status: 1 });
billingAccountSchema.index({ legacyOwnerId: 1 }, { sparse: true });
billingAccountSchema.index(
  { invoicePrefix: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
softDeletePlugin(billingAccountSchema);

export type BillingAccountDocument = InferSchemaType<typeof billingAccountSchema>;

export const BillingAccount =
  models.BillingAccount || model<BillingAccountDocument>("BillingAccount", billingAccountSchema);
