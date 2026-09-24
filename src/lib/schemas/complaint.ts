import { z } from "zod";
import { COMPLAINT_CATEGORIES, COMPLAINT_PRIORITIES, COMPLAINT_STATUSES } from "@/lib/domain-enums";
import { hex24 } from "./lease";

// `propertyId` is optional: single-property tenants pin it server-side from
// their Tenant rows, and multi-property tenants must pass it (route-level 400
// when ambiguous, 403 when the property is not theirs).
export const complaintInput = z.object({
  propertyId: z.string().regex(hex24).optional(),
  // Control chars are stripped at the boundary before any length validation so
  // an injected header (CR/LF) can never reach the email compositors.
  subject: z
    .string()
    .trim()
    // biome-ignore lint/suspicious/noControlCharactersInRegex: boundary-strips CR/LF/control chars before length checks and email composition.
    .transform((v) => v.replace(/[\r\n\u0000-\u001f]+/g, " "))
    .pipe(z.string().min(1, "Subject is required").max(200)),
  category: z.enum(COMPLAINT_CATEGORIES),
  message: z.string().trim().min(1, "Details are required"),
  priority: z.enum(COMPLAINT_PRIORITIES).default("medium"),
});

export const complaintUpdate = z.object({
  status: z.enum(COMPLAINT_STATUSES).optional(),
  resolution: z.string().max(5000).optional(),
});

export type ComplaintInput = z.infer<typeof complaintInput>;
export type ComplaintUpdate = z.infer<typeof complaintUpdate>;
