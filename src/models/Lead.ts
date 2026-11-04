import { type InferSchemaType, model, models, Schema } from "mongoose";
import { LEAD_STATUSES } from "@/lib/domain-enums";
import { softDeletePlugin } from "@/lib/mongoose-soft-delete";

/**
 * A prospect/lead — a lightweight record with no User account and no password.
 * A lead graduates to a `Tenant` (and, when they first sign in, a `User`) on
 * move-in conversion. Until then it is purely a tracking record owned by a
 * portfolio's owner.
 */
const leadSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: "" },
    propertyId: { type: String, trim: true, default: "" },
    unitId: { type: String, trim: true, default: "" },
    ownerId: { type: String, required: true },
    status: {
      type: String,
      enum: LEAD_STATUSES,
      default: "new",
      required: true,
    },
    source: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
    createdBy: { type: String, required: true },
    convertedAt: { type: Date, default: null },
    convertedTenantId: { type: String, trim: true, default: "" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Scoped reads: an owner's portfolio, newest first.
leadSchema.index({ ownerId: 1, status: 1 });
leadSchema.index({ ownerId: 1, createdAt: -1 });
// A phone may recur across unrelated leads; no unique constraint.
leadSchema.index({ phone: 1 });
softDeletePlugin(leadSchema);

export type LeadDocument = InferSchemaType<typeof leadSchema>;

export const Lead = models.Lead || model<LeadDocument>("Lead", leadSchema);
