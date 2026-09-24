import { type InferSchemaType, model, models, Schema } from "mongoose";

export const NOTIFICATION_TYPES = [
  "invoice:paid",
  "invoice:overdue",
  "lease:expiring",
  "complaint:created",
  "complaint:status-changed",
  "chat:reply",
  "announcement",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_CHANNELS = ["in-app", "email"] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export interface INotification {
  recipientUserId: string;
  recipientRole?: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  link: string;
  channels: NotificationChannel[];
  readAt?: Date;
  emailSentAt?: Date;
  dedupeKey: string;
}

const notificationSchema = new Schema<INotification>(
  {
    recipientUserId: { type: String, required: true },
    recipientRole: { type: String },
    type: { type: String, enum: [...NOTIFICATION_TYPES], required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    data: { type: Schema.Types.Mixed, default: {} },
    link: { type: String, default: "" },
    channels: { type: [String], enum: [...NOTIFICATION_CHANNELS], default: ["in-app"] },
    readAt: { type: Date },
    emailSentAt: { type: Date },
    dedupeKey: { type: String, default: "" },
  },
  {
    timestamps: true,
  },
);

const retentionDays = Number(process.env.NOTIFICATION_RETENTION_DAYS ?? 90);
notificationSchema.index({ recipientUserId: 1, createdAt: -1 });
notificationSchema.index({ recipientUserId: 1, readAt: 1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: retentionDays * 24 * 60 * 60 });
// One row per recipient per event; empty dedupeKeys (no event id) never collide.
notificationSchema.index(
  { recipientUserId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $ne: "" } } },
);

export type NotificationDocument = InferSchemaType<INotification>;

/**
 * Copies a notification doc, normalizing `readAt`/`emailSentAt` to ISO strings
 * (null when unset) and defaulting `data`/`link`/`channels` for docs created
 * before those defaults existed.
 */
export function serializeNotification<
  T extends {
    data?: unknown;
    link?: string;
    channels?: NotificationChannel[];
    readAt?: Date;
    emailSentAt?: Date;
  },
>(doc: T) {
  return {
    ...doc,
    data: doc.data ?? {},
    link: doc.link ?? "",
    channels: doc.channels ?? ["in-app"],
    readAt: doc.readAt ? new Date(doc.readAt).toISOString() : null,
    emailSentAt: doc.emailSentAt ? new Date(doc.emailSentAt).toISOString() : null,
  };
}

export const Notification =
  models.Notification || model<INotification>("Notification", notificationSchema);
