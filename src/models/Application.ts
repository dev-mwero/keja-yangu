import { type InferSchemaType, model, models, Schema } from "mongoose";
import { APPLICATION_STATUSES } from "@/lib/domain-enums";
import { softDeletePlugin } from "@/lib/mongoose-soft-delete";

export type { ApplicationStatus } from "@/lib/domain-enums";
export { APPLICATION_STATUSES };

/**
 * A prospective tenant's application for a published property. The `ownerId` is
 * resolved from the property at creation time so the owner/caretaker/custodian
 * dashboards can scope to their portfolio without a join.
 */
const applicationSchema = new Schema(
  {
    propertyId: { type: String, required: true },
    // The specific unit the applicant asked for; empty = property-level request.
    unitId: { type: String, default: "" },
    ownerId: { type: String, required: true },
    applicantUserId: { type: String, required: true },
    applicantName: { type: String, required: true, trim: true },
    applicantEmail: { type: String, required: true, trim: true, lowercase: true },
    message: { type: String, default: "" },
    status: { type: String, enum: [...APPLICATION_STATUSES], default: "pending" },
    decidedById: { type: String, default: "" },
    decisionNote: { type: String, default: "" },
    decidedAt: { type: Date },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

applicationSchema.index({ ownerId: 1, status: 1 });
applicationSchema.index({ propertyId: 1, status: 1 });
applicationSchema.index({ propertyId: 1, unitId: 1, status: 1 });
applicationSchema.index({ applicantUserId: 1, status: 1 });
// At most one live pending application per applicant per property.
applicationSchema.index(
  { propertyId: 1, applicantUserId: 1 },
  { unique: true, partialFilterExpression: { status: "pending", deletedAt: null } },
);
softDeletePlugin(applicationSchema);

export type ApplicationDocument = InferSchemaType<typeof applicationSchema>;

export const Application = models.Application || model("Application", applicationSchema);
