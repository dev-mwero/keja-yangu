import { z } from "zod";
import { hex24 } from "./lease";

export const chatThreadInput = z.object({
  recipientId: z.string().regex(hex24),
  role: z.enum(["owner", "caretaker"]),
  // Optional: single-property tenants pin it server-side; multi-property
  // tenants must pass it (route-level 400 when ambiguous).
  propertyId: z.string().regex(hex24).optional(),
});

export const chatMessageInput = z.object({
  text: z.string().trim().min(1, "Message is required").max(2000),
});

export type ChatThreadInput = z.infer<typeof chatThreadInput>;
export type ChatMessageInput = z.infer<typeof chatMessageInput>;
