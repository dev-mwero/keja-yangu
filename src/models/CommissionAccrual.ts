import { type InferSchemaType, model, models, Schema } from "mongoose";
import { COMMISSION_ACCRUAL_KINDS, COMMISSION_ACCRUAL_STATUSES } from "@/lib/domain-enums";

export type {
  CommissionAccrualKind,
  CommissionAccrualStatus,
} from "@/lib/domain-enums";
export { COMMISSION_ACCRUAL_KINDS, COMMISSION_ACCRUAL_STATUSES };

const agreementSnapshotSchema = new Schema(
  {
    basis: { type: String, required: true },
    rateBps: { type: Number, default: 0, min: 0, max: 10000 },
    fixedAmountMinor: { type: Number, default: 0, min: 0 },
    taxBps: { type: Number, default: 0, min: 0, max: 10000 },
    currency: { type: String, default: "KES", trim: true },
    paymentTerms: { type: String, default: "" },
  },
  { _id: false },
);

const commissionAccrualSchema = new Schema(
  {
    attributionId: { type: String, default: "" },
    agreementId: { type: String, default: "" },
    brokerUserId: { type: String, required: true, trim: true },
    propertyId: { type: String, default: "", trim: true },
    unitId: { type: String, default: "", trim: true },
    leaseId: { type: String, default: "", trim: true },
    invoiceId: { type: String, required: true, trim: true },
    paymentId: { type: String, default: "", trim: true },
    kind: {
      type: String,
      enum: [...COMMISSION_ACCRUAL_KINDS],
      default: "initial",
    },
    snapshot: { type: agreementSnapshotSchema, default: () => ({}) },
    basisMinor: { type: Number, default: 0, min: 0 },
    grossMinor: { type: Number, default: 0 },
    taxMinor: { type: Number, default: 0, min: 0 },
    netMinor: { type: Number, default: 0 },
    currency: { type: String, default: "KES", trim: true },
    status: {
      type: String,
      enum: [...COMMISSION_ACCRUAL_STATUSES],
      default: "pending",
    },
    eligibilityAt: { type: Date, default: () => new Date() },
    approvedByUserId: { type: String, default: "", trim: true },
    approvedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    payoutId: { type: String, default: "", trim: true },
    reversedAt: { type: Date, default: null },
    reversalReason: { type: String, default: "" },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

// Replay mutex: one accrual per attribution/invoice/kind even under concurrent
// webhook + staff settlement paths.
commissionAccrualSchema.index(
  { attributionId: 1, invoiceId: 1, kind: 1 },
  {
    unique: true,
    partialFilterExpression: { attributionId: { $gt: "" } },
  },
);

commissionAccrualSchema.index({ brokerUserId: 1, status: 1, eligibilityAt: 1 });
commissionAccrualSchema.index({ status: 1, eligibilityAt: 1 });
commissionAccrualSchema.index({ payoutId: 1 });
commissionAccrualSchema.index({ leaseId: 1, kind: 1 });

export type CommissionAccrualDocument = InferSchemaType<typeof commissionAccrualSchema>;

export const CommissionAccrual =
  models.CommissionAccrual ||
  model<CommissionAccrualDocument>("CommissionAccrual", commissionAccrualSchema);
