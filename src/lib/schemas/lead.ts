import { z } from "zod";
import { LEAD_STATUSES } from "@/lib/domain-enums";

export const leadInput = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().min(1, "Phone is required"),
  email: z.string().trim().email("Invalid email").optional().or(z.literal("")),
  propertyId: z.string().trim().min(1).optional(),
  unitId: z.string().trim().min(1).optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  source: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export type LeadInput = z.infer<typeof leadInput>;

export const leadUpdateInput = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  notes: z.string().trim().optional(),
  source: z.string().trim().optional(),
});

export type LeadUpdateInput = z.infer<typeof leadUpdateInput>;

export const leadIdParam = z.object({
  id: z.string().trim().min(1, "Lead id is required"),
});
