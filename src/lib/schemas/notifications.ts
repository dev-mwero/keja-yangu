import { z } from "zod";
import { NOTIFICATION_TYPES } from "@/models/Notification";

/** GET /api/v1/notifications query params. `type` is a closed enum — a bogus
 * value is rejected with a 400 before it reaches the Mongo filter.
 */
export const notificationsQuery = z.object({
  type: z.enum(NOTIFICATION_TYPES).optional().nullable(),
});

export type NotificationsQuery = z.infer<typeof notificationsQuery>;
