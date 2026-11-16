import mongoose, { type InferSchemaType, model, Schema } from "mongoose";

const contactMessageSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    subject: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    status: {
      type: String,
      enum: ["new", "read"],
      default: "new",
      required: true,
    },
    readAt: { type: Date, default: null },
    readBy: { type: String, default: "" },
  },
  { timestamps: true },
);

contactMessageSchema.index({ status: 1, createdAt: -1 });
contactMessageSchema.index({ createdAt: -1 });

export type ContactMessageDocument = InferSchemaType<typeof contactMessageSchema>;

export const ContactMessage =
  mongoose.models.ContactMessage ||
  model<ContactMessageDocument>("ContactMessage", contactMessageSchema);
