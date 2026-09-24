import { type InferSchemaType, model, models, Schema } from "mongoose";
import { ANNOUNCEMENT_AUDIENCES, type AnnouncementAudience } from "@/lib/domain-enums";

export type { AnnouncementAudience };
export { ANNOUNCEMENT_AUDIENCES };

export interface IAnnouncement {
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  ownerId: string;
  propertyId: string;
  pinned: boolean;
  audience: AnnouncementAudience;
}

const announcementSchema = new Schema<IAnnouncement>(
  {
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 5000 },
    authorId: { type: String, required: true },
    authorName: { type: String, required: true },
    ownerId: { type: String, required: true },
    // Empty string means portfolio-wide, matching the shared dashboard store.
    propertyId: { type: String, default: "" },
    pinned: { type: Boolean, default: false },
    audience: { type: String, enum: [...ANNOUNCEMENT_AUDIENCES], default: "tenants" },
  },
  {
    timestamps: true,
  },
);

announcementSchema.index({ ownerId: 1, pinned: -1, createdAt: -1 });
announcementSchema.index({ propertyId: 1, pinned: -1, createdAt: -1 });

export type AnnouncementDocument = InferSchemaType<IAnnouncement>;

export const Announcement =
  models.Announcement || model<IAnnouncement>("Announcement", announcementSchema);
