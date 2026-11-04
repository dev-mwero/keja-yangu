import { type InferSchemaType, model, models, Schema } from "mongoose";
import { UNIT_BILLING_ASSIGNMENT_STATUSES } from "@/lib/domain-enums";

export type { UnitBillingAssignmentStatus } from "@/lib/domain-enums";
export { UNIT_BILLING_ASSIGNMENT_STATUSES };

export interface IUnitBillingAssignment {
  unitId: string;
  billingAccountId: string;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  status: (typeof UNIT_BILLING_ASSIGNMENT_STATUSES)[number];
  assignedByUserId: string;
  reason?: string;
  legacyOwnerId?: string;
}

const unitBillingAssignmentSchema = new Schema<IUnitBillingAssignment>(
  {
    unitId: { type: String, required: true },
    billingAccountId: { type: String, required: true },
    effectiveFrom: { type: Date, required: true, default: Date.now },
    effectiveTo: { type: Date, default: null },
    status: {
      type: String,
      enum: [...UNIT_BILLING_ASSIGNMENT_STATUSES],
      default: "active",
    },
    assignedByUserId: { type: String, required: true },
    reason: { type: String, default: "" },
    legacyOwnerId: { type: String, default: "" },
  },
  { timestamps: true },
);

unitBillingAssignmentSchema.index(
  { unitId: 1 },
  { unique: true, partialFilterExpression: { status: "active" } },
);
unitBillingAssignmentSchema.index({ billingAccountId: 1, status: 1 });
unitBillingAssignmentSchema.index({ unitId: 1, effectiveFrom: -1 });

export type UnitBillingAssignmentDocument = InferSchemaType<typeof unitBillingAssignmentSchema>;

export const UnitBillingAssignment =
  models.UnitBillingAssignment ||
  model<UnitBillingAssignmentDocument>("UnitBillingAssignment", unitBillingAssignmentSchema);
