import { z } from "zod";
import { APPLICATION_DECISION_STATUSES } from "@/lib/domain-enums";

/** The fields an applicant fills in on the public property page. */
export const applicationFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name must be under 100 characters"),
  email: z.string().trim().email("Invalid email").max(255, "Email must be under 255 characters"),
  message: z.string().trim().max(500, "Message must be under 500 characters").optional(),
});

export const applicationCreateInput = applicationFormSchema.extend({
  propertyId: z.string().trim().min(1),
  unitId: z.string().trim().min(1).optional(),
});

export const applicationDecisionInput = z.object({
  status: z.enum(APPLICATION_DECISION_STATUSES),
  decisionNote: z.string().trim().max(1000).optional(),
});

export type ApplicationFormInput = z.infer<typeof applicationFormSchema>;
export type ApplicationCreateInput = z.infer<typeof applicationCreateInput>;
export type ApplicationDecisionInput = z.infer<typeof applicationDecisionInput>;
