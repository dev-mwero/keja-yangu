import { type InferSchemaType, model, models, Schema } from "mongoose";

export interface ITenant {
  name: string;
  email: string;
  phone?: string;
  propertyId: string;
  ownerId: string;
  status: "active" | "pending" | "rejected";
  userId?: string;
  joinedAt?: Date;
  notes?: string;
}

const tenantSchema = new Schema<ITenant>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String },
    propertyId: { type: String, required: true },
    ownerId: { type: String, required: true },
    status: {
      type: String,
      enum: ["active", "pending", "rejected"],
      default: "pending",
    },
    userId: { type: String, default: "" },
    joinedAt: { type: Date },
    notes: { type: String },
  },
  {
    timestamps: true,
  },
);

tenantSchema.index({ propertyId: 1, email: 1 }, { unique: true });
tenantSchema.index({ userId: 1 });

export type TenantDocument = InferSchemaType<ITenant>;

export const TENANT_SAFE_FIELDS =
  "name email phone propertyId ownerId status joinedAt notes createdAt updatedAt";

export const Tenant = models.Tenant || model<ITenant>("Tenant", tenantSchema);
