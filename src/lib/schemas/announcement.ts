import { z } from "zod";
import { ANNOUNCEMENT_AUDIENCES } from "@/lib/domain-enums";
import { hex24 } from "./lease";

export const announcementInput = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  body: z.string().trim().min(1, "Body is required").max(5000),
  // Empty string (portfolio-wide) is the default; a property id pins it.
  propertyId: z.union([z.string().regex(hex24), z.literal("")]).optional(),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES).default("tenants"),
  pinned: z.boolean().default(false),
});

export type AnnouncementInput = z.infer<typeof announcementInput>;
