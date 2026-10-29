import { type InferSchemaType, model, models, Schema } from "mongoose";
import {
  INVOICE_METHODS,
  INVOICE_STATUSES,
  type InvoiceMethod,
  type InvoiceStatus,
  PERIOD_REGEX,
} from "@/lib/invoicing";
import { softDeletePlugin } from "@/lib/mongoose-soft-delete";

export type { InvoiceMethod, InvoiceStatus };
export { INVOICE_METHODS, INVOICE_STATUSES };

export interface IInvoice {
  invoiceNumber: string;
  tenantId: string;
  propertyId: string;
  leaseId: string;
  ownerId: string;
  period: string;
  amountDue: number;
  amountPaid: number;
  status: InvoiceStatus;
  dueDate: Date;
  issuedAt: Date;
  paidAt?: Date;
  method?: InvoiceMethod;
  notes?: string;
  paymentReference?: string;
  paymentDescription?: string;
  paidBy?: string;
  paidByRole?: string;
  // Breakdown of amountDue into rent (→ owner) and service charge (→ caretaker).
  // Populated at generation time from the unit's service-charge configuration.
  rentAmount: number;
  serviceChargeAmount: number;
  rentIncludesServiceCharge: boolean;
  deletedAt?: Date | null;
}

const invoiceSchema = new Schema<IInvoice>(
  {
    invoiceNumber: { type: String, required: true },
    tenantId: { type: String, required: true },
    propertyId: { type: String, required: true },
    leaseId: { type: String, default: "" },
    ownerId: { type: String, required: true },
    period: { type: String, required: true, match: PERIOD_REGEX },
    amountDue: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0 },
    status: { type: String, enum: [...INVOICE_STATUSES], default: "pending" },
    dueDate: { type: Date, required: true },
    issuedAt: { type: Date, default: Date.now },
    paidAt: { type: Date },
    method: { type: String, enum: [...INVOICE_METHODS] },
    notes: { type: String },
    paymentReference: { type: String, trim: true, default: "" },
    paymentDescription: { type: String, trim: true, default: "" },
    paidBy: { type: String },
    paidByRole: { type: String },
    rentAmount: { type: Number, required: true, min: 0, default: 0 },
    serviceChargeAmount: { type: Number, required: true, min: 0, default: 0 },
    rentIncludesServiceCharge: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

invoiceSchema.index({ ownerId: 1, period: 1 });
invoiceSchema.index({ tenantId: 1 });
// Invoice numbers are unique among live invoices only.
invoiceSchema.index(
  { invoiceNumber: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
// Generation idempotency: one live invoice per lease per period (manual
// invoices never set leaseId, so they are excluded via the partial filter).
invoiceSchema.index(
  { leaseId: 1, period: 1 },
  { unique: true, partialFilterExpression: { leaseId: { $gt: "" }, deletedAt: null } },
);
softDeletePlugin(invoiceSchema);

export type InvoiceDocument = InferSchemaType<IInvoice>;

export const Invoice = models.Invoice || model<IInvoice>("Invoice", invoiceSchema);
