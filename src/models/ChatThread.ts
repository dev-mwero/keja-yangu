import { type InferSchemaType, model, models, Schema } from "mongoose";
import { MESSAGE_SENDER_ROLES, type MessageSenderRole } from "@/lib/domain-enums";

export type { MessageSenderRole };
export { MESSAGE_SENDER_ROLES };

export const CHAT_AGENT_ROLES = ["owner", "caretaker"] as const;
export type ChatAgentRole = (typeof CHAT_AGENT_ROLES)[number];

export interface IChatThread {
  tenantId: string;
  propertyId: string;
  ownerId: string;
  agentUserId: string;
  agentRole: ChatAgentRole;
  lastMessageAt: Date;
  lastMessageText: string;
  tenantLastReadAt?: Date;
  agentLastReadAt?: Date;
}

const chatThreadSchema = new Schema<IChatThread>(
  {
    tenantId: { type: String, required: true },
    propertyId: { type: String, required: true },
    ownerId: { type: String, required: true },
    agentUserId: { type: String, required: true },
    agentRole: { type: String, enum: [...CHAT_AGENT_ROLES], default: "owner" },
    lastMessageAt: { type: Date, default: Date.now },
    lastMessageText: { type: String, default: "" },
    tenantLastReadAt: { type: Date },
    agentLastReadAt: { type: Date },
  },
  {
    timestamps: true,
  },
);

chatThreadSchema.index({ tenantId: 1, propertyId: 1, agentUserId: 1 }, { unique: true });
chatThreadSchema.index({ ownerId: 1, lastMessageAt: -1 });
chatThreadSchema.index({ agentUserId: 1, lastMessageAt: -1 });

export type ChatThreadDocument = InferSchemaType<IChatThread>;

export const ChatThread = models.ChatThread || model<IChatThread>("ChatThread", chatThreadSchema);
