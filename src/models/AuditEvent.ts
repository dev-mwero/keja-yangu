import { type InferSchemaType, model, models, Schema } from "mongoose";

const auditScopeSchema = new Schema(
  {
    propertyId: { type: String, default: "" },
    blockId: { type: String, default: "" },
    unitId: { type: String, default: "" },
  },
  { _id: false },
);

const auditEventSchema = new Schema(
  {
    actorUserId: { type: String, required: true },
    actorRole: { type: String, required: true },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, default: "" },
    scope: { type: auditScopeSchema, default: () => ({}) },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    requestId: { type: String, default: "" },
    ipHash: { type: String, default: "" },
    userAgentHash: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

auditEventSchema.index({ actorUserId: 1, createdAt: -1 });
auditEventSchema.index({ action: 1, createdAt: -1 });
auditEventSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditEventSchema.index({ "scope.propertyId": 1, createdAt: -1 });

export type AuditEventDocument = InferSchemaType<typeof auditEventSchema>;

export const AuditEvent =
  models.AuditEvent || model<AuditEventDocument>("AuditEvent", auditEventSchema);
