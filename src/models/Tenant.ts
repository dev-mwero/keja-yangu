import { type InferSchemaType, model, models, Schema } from "mongoose";
import { softDeletePlugin } from "@/lib/mongoose-soft-delete";

export type TenantType = "residential" | "commercial" | "owning";

export interface ITenant {
  name: string;
  email: string;
  phone?: string;
  propertyId: string;
  ownerId: string;
  type: TenantType;
  status: "active" | "pending" | "rejected";
  userId?: string;
  joinedAt?: Date;
  notes?: string;
  deletedAt?: Date | null;
}

const tenantSchema = new Schema<ITenant>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String },
    propertyId: { type: String, required: true },
    ownerId: { type: String, required: true },
    type: {
      type: String,
      enum: ["residential", "commercial", "owning"],
      default: "residential",
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "pending", "rejected"],
      default: "pending",
    },
    userId: { type: String, default: "" },
    joinedAt: { type: Date },
    notes: { type: String },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

// One live tenant per email per property; soft-deleted rows are excluded so the
// email can be reused after deletion.
tenantSchema.index(
  { propertyId: 1, email: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
tenantSchema.index({ userId: 1 });
softDeletePlugin(tenantSchema);

export type TenantDocument = InferSchemaType<ITenant>;

export const TENANT_SAFE_FIELDS =
  "name email phone type propertyId ownerId status joinedAt notes createdAt updatedAt";

export const Tenant = models.Tenant || model<ITenant>("Tenant", tenantSchema);
