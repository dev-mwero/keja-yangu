import { z } from "zod";

export const hex24: RegExp = /^[0-9a-fA-F]{24}$/;

export const leaseInput = z.object({
  tenantId: z.string().regex(hex24),
  propertyId: z.string().regex(hex24),
  rentAmount: z.coerce.number().positive(),
  frequency: z.enum(["monthly"]).default("monthly"),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  status: z.enum(["active", "ended"]).default("active"),
  notes: z.string().optional(),
});

// Identity fields (tenantId/propertyId/ownerId/frequency) are immutable on
// PATCH — the server derives and strips them.
export const leaseUpdate = z.object({
  rentAmount: z.coerce.number().positive().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  status: z.enum(["active", "ended"]).optional(),
  notes: z.string().optional(),
});

export type LeaseInput = z.infer<typeof leaseInput>;
export type LeaseUpdate = z.infer<typeof leaseUpdate>;
