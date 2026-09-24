export type NotificationType =
  | "invoice:paid"
  | "invoice:overdue"
  | "lease:expiring"
  | "complaint:created"
  | "complaint:status-changed"
  | "chat:reply"
  | "announcement";

export type NotificationChannel = "in-app" | "email";

/**
 * Serialized notification as returned by `/api/v1/notifications`.
 * `readAt`/`emailSentAt` arrive as ISO strings (or null); dates are ISO via JSON.
 */
export interface AppNotification {
  _id: string;
  recipientUserId: string;
  recipientRole?: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  link: string;
  channels: NotificationChannel[];
  readAt: string | null;
  emailSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}
