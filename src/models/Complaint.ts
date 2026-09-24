import { type InferSchemaType, model, models, Schema } from "mongoose";
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_PRIORITIES,
  COMPLAINT_STATUSES,
  type ComplaintCategory,
  type ComplaintPriority,
  type ComplaintStatus,
} from "@/lib/domain-enums";

export type { ComplaintCategory, ComplaintPriority, ComplaintStatus };
export { COMPLAINT_CATEGORIES, COMPLAINT_PRIORITIES, COMPLAINT_STATUSES };

export interface IComplaint {
  tenantId: string;
  propertyId: string;
  ownerId: string;
  subject: string;
  category: ComplaintCategory;
  message: string;
  status: ComplaintStatus;
  priority: ComplaintPriority;
  resolution?: string;
  updatedById?: string;
  updatedByRole?: string;
}

const complaintSchema = new Schema<IComplaint>(
  {
    tenantId: { type: String, required: true },
    propertyId: { type: String, required: true },
    ownerId: { type: String, required: true },
    subject: { type: String, required: true, maxlength: 200 },
    category: { type: String, enum: [...COMPLAINT_CATEGORIES], required: true },
    message: { type: String, required: true },
    status: { type: String, enum: [...COMPLAINT_STATUSES], default: "open" },
    priority: { type: String, enum: [...COMPLAINT_PRIORITIES], default: "medium" },
    resolution: { type: String },
    updatedById: { type: String },
    updatedByRole: { type: String },
  },
  {
    timestamps: true,
  },
);

complaintSchema.index({ tenantId: 1, createdAt: -1 });
complaintSchema.index({ propertyId: 1, status: 1 });
complaintSchema.index({ ownerId: 1, createdAt: -1 });

export type ComplaintDocument = InferSchemaType<IComplaint>;

export const Complaint = models.Complaint || model<IComplaint>("Complaint", complaintSchema);
