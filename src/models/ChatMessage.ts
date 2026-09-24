import { type InferSchemaType, model, models, Schema } from "mongoose";
import { MESSAGE_SENDER_ROLES, type MessageSenderRole } from "@/lib/domain-enums";

export type { MessageSenderRole };
export { MESSAGE_SENDER_ROLES };

export interface IChatMessage {
  threadId: string;
  senderUserId: string;
  senderRole: MessageSenderRole;
  text: string;
}

const chatMessageSchema = new Schema<IChatMessage>(
  {
    threadId: { type: String, required: true },
    senderUserId: { type: String, required: true },
    senderRole: { type: String, enum: [...MESSAGE_SENDER_ROLES], required: true },
    text: { type: String, required: true, maxlength: 2000 },
  },
  {
    timestamps: true,
  },
);

chatMessageSchema.index({ threadId: 1, createdAt: 1 });

export type ChatMessageDocument = InferSchemaType<IChatMessage>;

export const ChatMessage =
  models.ChatMessage || model<IChatMessage>("ChatMessage", chatMessageSchema);
