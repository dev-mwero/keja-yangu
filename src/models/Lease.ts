import { type InferSchemaType, model, models, Schema } from "mongoose";

export interface ILease {
  tenantId: string;
  propertyId: string;
  ownerId: string;
  rentAmount: number;
  frequency: "monthly";
  startDate: Date;
  endDate?: Date;
  status: "active" | "ended";
  notes?: string;
}

const leaseSchema = new Schema<ILease>(
  {
    tenantId: { type: String, required: true },
    propertyId: { type: String, required: true },
    ownerId: { type: String, required: true },
    rentAmount: { type: Number, required: true, min: 0 },
    frequency: { type: String, enum: ["monthly"], default: "monthly" },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    status: { type: String, enum: ["active", "ended"], default: "active" },
    notes: { type: String },
  },
  {
    timestamps: true,
  },
);

leaseSchema.index({ ownerId: 1 });
leaseSchema.index({ tenantId: 1 });
leaseSchema.index({ propertyId: 1 });
// One active lease per tenant; ended leases remain as history.
leaseSchema.index({ tenantId: 1 }, { unique: true, partialFilterExpression: { status: "active" } });

export type LeaseDocument = InferSchemaType<ILease>;

export const Lease = models.Lease || model<ILease>("Lease", leaseSchema);
