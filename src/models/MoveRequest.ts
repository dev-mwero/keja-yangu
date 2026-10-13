import { type InferSchemaType, model, models, Schema } from "mongoose";
import { MOVE_REQUEST_STATUSES, MOVE_REQUEST_TYPES } from "@/lib/domain-enums";

export type { MoveRequestStatus, MoveRequestType } from "@/lib/domain-enums";
export { MOVE_REQUEST_STATUSES, MOVE_REQUEST_TYPES };

const moveRequestSchema = new Schema(
  {
    type: { type: String, enum: [...MOVE_REQUEST_TYPES], required: true },
    propertyId: { type: String, required: true },
    ownerId: { type: String, required: true },
    blockId: { type: String, default: "" },
    unitId: { type: String, default: "" },
    tenantId: { type: String, default: "" },
    requestedById: { type: String, required: true },
    requestedByRole: { type: String, required: true },
    requestedFor: { type: String, default: "" },
    requestedDate: { type: Date },
    note: { type: String, default: "" },
    status: { type: String, enum: [...MOVE_REQUEST_STATUSES], default: "pending" },
    decidedById: { type: String, default: "" },
    decisionNote: { type: String, default: "" },
    decidedAt: { type: Date },
  },
  { timestamps: true },
);

moveRequestSchema.index({ ownerId: 1, status: 1 });
moveRequestSchema.index({ propertyId: 1, status: 1 });
moveRequestSchema.index({ tenantId: 1, status: 1 });

export type MoveRequestDocument = InferSchemaType<typeof moveRequestSchema>;

export const MoveRequest = models.MoveRequest || model("MoveRequest", moveRequestSchema);
