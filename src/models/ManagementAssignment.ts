import mongoose, { type InferSchemaType, model, Schema } from "mongoose";
import {
  ASSIGNMENT_ACCESS_ROLES,
  ASSIGNMENT_SCOPE_TYPES,
  ASSIGNMENT_SOURCES,
  ASSIGNMENT_STATUSES,
} from "@/lib/domain-enums";

export type {
  AssignmentAccessRole,
  AssignmentScopeType,
  AssignmentSource,
  AssignmentStatus,
} from "@/lib/domain-enums";
export { ASSIGNMENT_ACCESS_ROLES, ASSIGNMENT_SCOPE_TYPES, ASSIGNMENT_SOURCES, ASSIGNMENT_STATUSES };

const managementAssignmentSchema = new Schema(
  {
    principalUserId: { type: String, required: true },
    accessRole: { type: String, enum: [...ASSIGNMENT_ACCESS_ROLES], required: true },
    scopeType: { type: String, enum: [...ASSIGNMENT_SCOPE_TYPES], required: true },
    propertyId: { type: String, required: true },
    blockId: { type: String, default: "" },
    unitId: { type: String, default: "" },
    permissions: { type: [String], default: [] },
    status: { type: String, enum: [...ASSIGNMENT_STATUSES], default: "pending" },
    startsAt: { type: Date, default: Date.now },
    endsAt: { type: Date, default: null },
    grantedByUserId: { type: String, required: true },
    grantedAt: { type: Date, default: Date.now },
    acceptedAt: { type: Date, default: null },
    revokedByUserId: { type: String, default: "" },
    revokedAt: { type: Date, default: null },
    reason: { type: String, default: "" },
    source: { type: String, enum: [...ASSIGNMENT_SOURCES], default: "system" },
    legacyOwnerId: { type: String, default: "" },
  },
  { timestamps: true },
);

managementAssignmentSchema.index(
  {
    principalUserId: 1,
    accessRole: 1,
    scopeType: 1,
    propertyId: 1,
    blockId: 1,
    unitId: 1,
  },
  { unique: true, partialFilterExpression: { status: "active" } },
);
managementAssignmentSchema.index({ principalUserId: 1, status: 1, startsAt: 1, endsAt: 1 });
managementAssignmentSchema.index({ propertyId: 1, scopeType: 1, status: 1 });
managementAssignmentSchema.index({ blockId: 1, status: 1 });
managementAssignmentSchema.index({ unitId: 1, status: 1 });

export type ManagementAssignmentDocument = InferSchemaType<typeof managementAssignmentSchema>;

export const ManagementAssignment =
  mongoose.models.ManagementAssignment ||
  model<ManagementAssignmentDocument>("ManagementAssignment", managementAssignmentSchema);
