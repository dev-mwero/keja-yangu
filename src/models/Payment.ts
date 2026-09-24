import { type InferSchemaType, model, models, Schema } from "mongoose";
import {
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  type PaymentProviderName,
  type PaymentStatus,
} from "@/lib/payments/provider";

export type { PaymentProviderName, PaymentStatus };
export { PAYMENT_PROVIDERS, PAYMENT_STATUSES };

export interface IPayment {
  provider: PaymentProviderName;
  providerReference: string;
  invoiceId: string;
  tenantId: string;
  ownerId: string;
  propertyId: string;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  authorizationUrl?: string;
  channel?: string;
  paidAt?: Date;
  initiatedAt: Date;
  expiresAt: Date;
  lastEvent?: string;
  rawEvent?: unknown;
  notes?: string[];
}

const paymentSchema = new Schema<IPayment>(
  {
    provider: { type: String, enum: [...PAYMENT_PROVIDERS], required: true },
    providerReference: { type: String, required: true },
    invoiceId: { type: String, required: true },
    tenantId: { type: String, required: true },
    ownerId: { type: String, required: true },
    propertyId: { type: String, required: true },
    amountMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "KES" },
    status: { type: String, enum: [...PAYMENT_STATUSES], default: "pending" },
    authorizationUrl: { type: String },
    channel: { type: String },
    paidAt: { type: Date },
    initiatedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    lastEvent: { type: String },
    rawEvent: { type: Schema.Types.Mixed },
    notes: { type: [String], default: [] },
  },
  {
    timestamps: true,
  },
);

// One attempt per provider reference; this unique index is the idempotency
// mutex that makes staff-vs-webhook races settle exactly once.
paymentSchema.index({ provider: 1, providerReference: 1 }, { unique: true });
paymentSchema.index({ invoiceId: 1, status: 1 });
// At most one live checkout window per invoice; the pending-only partial index
// is the concurrency mutex that stops two initiates minting two pending rows.
paymentSchema.index(
  { invoiceId: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);
paymentSchema.index({ tenantId: 1, createdAt: -1 });
paymentSchema.index({ ownerId: 1, createdAt: -1 });
// Pending checkouts self-expire 90 minutes after initiation; successful,
// failed and abandoned rows are kept as history.
paymentSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { status: "pending" } },
);

/**
 * Copies a payment doc, stripping the `rawEvent` audit field (never needed by
 * clients and potentially large).
 */
export function serializePayment<T extends { rawEvent?: unknown }>(doc: T): Omit<T, "rawEvent"> {
  const { rawEvent: _rawEvent, ...rest } = doc;
  void _rawEvent;
  return rest;
}

export type PaymentDocument = InferSchemaType<IPayment>;

export const Payment = models.Payment || model<IPayment>("Payment", paymentSchema);
